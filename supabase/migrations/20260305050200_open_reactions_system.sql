-- Open up the reactions system.
--
-- Previously, the "hivecom" provider enforced a fixed emote allow-list at
-- both the trigger level (validate_hivecom_reactions) and inside the
-- toggle_reaction RPC. External providers were hard-blocked from the RPC
-- entirely.
--
-- This migration removes all emote-list enforcement and provider restrictions
-- so that:
--   1. Any valid emoji/string (within length bounds) can be used as a react.
--   2. Any provider key can be used (hivecom, xdd, or anything else).
--   3. Front-ends decide what to display - unknown emotes are simply dropped
--      at the display layer.
--
-- Existing reaction data requires NO structural migration - the JSONB shape
-- { provider: { emote: [uuid, …] } } is unchanged.
--
-- Security model is preserved:
--   - protect_reactions_column trigger still blocks direct column writes
--   - toggle_reaction RPC is still the only user-facing write path
--   - Row-level FOR UPDATE lock prevents race conditions


-- ─────────────────────────────────────────────
-- 1. Drop emote validation triggers
-- ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS validate_discussions_hivecom_reactions
  ON public.discussions;

DROP TRIGGER IF EXISTS validate_discussion_replies_hivecom_reactions
  ON public.discussion_replies;

DROP FUNCTION IF EXISTS public.validate_hivecom_reactions();


-- ─────────────────────────────────────────────
-- 2. Drop the allow-list function
-- ─────────────────────────────────────────────

-- Revoke grants first to be clean.
REVOKE ALL ON FUNCTION public.get_allowed_hivecom_emotes() FROM authenticated, anon, service_role;

DROP FUNCTION IF EXISTS public.get_allowed_hivecom_emotes();


-- ─────────────────────────────────────────────
-- 3. Replace toggle_reaction RPC
-- ─────────────────────────────────────────────
-- Removes emote allow-list and provider hard-lock.
-- Adds lightweight length/sanity bounds to prevent abuse.
-- Keeps the GUC bypass for protect_reactions_column trigger.

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_table    text,
  p_id       uuid,
  p_emote    text,
  p_provider text DEFAULT 'hivecom'
)
RETURNS jsonb AS $$
DECLARE
  v_user_id   uuid;
  v_reactions jsonb;
  v_users     jsonb;
  v_user_str  text;
  v_sql       text;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Table allow-list ──────────────────────────────────────────────────────
  IF p_table NOT IN ('discussions', 'discussion_replies') THEN
    RAISE EXCEPTION 'Invalid target table "%"', p_table
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── Sanity bounds ─────────────────────────────────────────────────────────
  -- Prevent abuse without restricting which emojis or provider keys are valid.
  -- Front-ends decide what to display; the DB just stores it.
  IF p_emote IS NULL OR char_length(p_emote) = 0 OR char_length(p_emote) > 32 THEN
    RAISE EXCEPTION 'Emote must be between 1 and 32 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_provider IS NULL OR char_length(p_provider) = 0 OR char_length(p_provider) > 64 THEN
    RAISE EXCEPTION 'Provider must be between 1 and 64 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Signal to the protect_reactions_column trigger that this UPDATE is
  --    originating from the RPC and should be allowed through.
  --    LOCAL scopes the setting to the current transaction only.
  PERFORM pg_catalog.set_config('app.reactions_rpc_active', 'true', true);

  -- ── Fetch current reactions (lock row for update) ─────────────────────────
  v_sql := format(
    'SELECT reactions FROM public.%I WHERE id = $1 FOR UPDATE',
    p_table
  );
  EXECUTE v_sql INTO v_reactions USING p_id;

  IF v_reactions IS NULL THEN
    RAISE EXCEPTION 'Row not found in %', p_table
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Toggle ────────────────────────────────────────────────────────────────
  v_user_str := v_user_id::text;
  v_users := COALESCE(v_reactions -> p_provider -> p_emote, '[]'::jsonb);

  IF v_users @> to_jsonb(v_user_str) THEN
    -- User already reacted -> remove them
    SELECT jsonb_agg(el)
    INTO   v_users
    FROM   jsonb_array_elements(v_users) AS el
    WHERE  el <> to_jsonb(v_user_str);

    -- jsonb_agg returns NULL for an empty result set
    v_users := COALESCE(v_users, '[]'::jsonb);
  ELSE
    -- User has not reacted -> add them
    v_users := v_users || to_jsonb(v_user_str);
  END IF;

  -- ── Write back ────────────────────────────────────────────────────────────
  IF v_users = '[]'::jsonb THEN
    -- Removing: only touch the structure if the provider key exists.
    IF v_reactions -> p_provider IS NOT NULL THEN
      v_reactions := v_reactions #- ARRAY[p_provider, p_emote];

      -- Drop the provider object entirely if it is now empty.
      IF (v_reactions -> p_provider) = '{}'::jsonb THEN
        v_reactions := v_reactions - p_provider;
      END IF;
    END IF;
  ELSE
    -- Adding: seed the provider object if absent, then set the emote.
    IF v_reactions -> p_provider IS NULL THEN
      v_reactions := jsonb_set(v_reactions, ARRAY[p_provider], '{}'::jsonb, true);
    END IF;

    v_reactions := jsonb_set(
      v_reactions,
      ARRAY[p_provider, p_emote],
      v_users,
      true
    );
  END IF;

  -- ── Persist ───────────────────────────────────────────────────────────────
  v_sql := format(
    'UPDATE public.%I SET reactions = $1 WHERE id = $2 RETURNING reactions',
    p_table
  );
  EXECUTE v_sql INTO v_reactions USING v_reactions, p_id;

  RETURN v_reactions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.toggle_reaction(text, uuid, text, text) IS
  'Atomically add or remove the calling user''s reaction on a discussion or '
  'discussion_reply row. '
  'p_table must be "discussions" or "discussion_replies". '
  'p_provider defaults to "hivecom"; any provider key is accepted. '
  'p_emote can be any string up to 32 characters (typically a Unicode emoji). '
  'Front-ends decide which emotes to display; unknown emotes are dropped at '
  'the display layer. '
  'Returns the updated reactions JSONB for the target row.';


-- ─────────────────────────────────────────────
-- 4. Update column comments
-- ─────────────────────────────────────────────

COMMENT ON COLUMN public.discussions.reactions IS
  'Reactions stored as {provider: {emote: [user_uuid, ...]}}. '
  'Any provider key and any emote string are accepted. '
  'Front-ends decide which emotes to render.';

COMMENT ON COLUMN public.discussion_replies.reactions IS
  'Reactions stored as {provider: {emote: [user_uuid, ...]}}. '
  'Any provider key and any emote string are accepted. '
  'Front-ends decide which emotes to render.';
