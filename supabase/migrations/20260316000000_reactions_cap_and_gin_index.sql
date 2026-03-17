-- Reactions: per-emote cap (100) + jsonb_path_ops GIN indexes.
--
-- Changes
-- ───────
-- 1. toggle_reaction now rejects an add when the emote array already has
--    100 entries.  Removals are always allowed.  The cap is intentionally
--    per-emote per-row - a post can accumulate reactions across many emotes
--    freely; no single emote can exceed 100 reactors.
--
--    Front-ends should display the count as "MAX" when it reaches 100 so
--    users understand the ceiling.
--
-- 2. The GIN indexes on discussions.reactions and
--    discussion_replies.reactions are replaced with jsonb_path_ops variants.
--    jsonb_path_ops indexes only leaf values (the UUID strings), not key
--    names, making it smaller on disk and faster for the @> containment
--    queries that toggle_reaction and any future "who reacted" lookups use.
--    We never query reactions by key name alone, so the reduced operator
--    coverage (no ? / ?| / ?& support) is not a loss here.

-- ─────────────────────────────────────────────
-- 1. Replace GIN indexes with jsonb_path_ops
-- ─────────────────────────────────────────────

DROP INDEX IF EXISTS public.discussions_reactions_gin_idx;
DROP INDEX IF EXISTS public.discussion_replies_reactions_gin_idx;

CREATE INDEX discussions_reactions_gin_idx
  ON public.discussions USING GIN (reactions jsonb_path_ops);

CREATE INDEX discussion_replies_reactions_gin_idx
  ON public.discussion_replies USING GIN (reactions jsonb_path_ops);

-- ─────────────────────────────────────────────
-- 2. Replace toggle_reaction with cap-enforcing version
-- ─────────────────────────────────────────────
-- Preserves the open system from 20260305050200 (no allow-list, any provider,
-- any emote up to 32 chars). Adds only the per-emote reactor cap.

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
  -- No emote or provider allow-list - front-ends decide what to display.
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
    -- User already reacted - remove them (always allowed, cap does not apply).
    SELECT jsonb_agg(el)
    INTO   v_users
    FROM   jsonb_array_elements(v_users) AS el
    WHERE  el <> to_jsonb(v_user_str);

    -- jsonb_agg returns NULL for an empty result set.
    v_users := COALESCE(v_users, '[]'::jsonb);
  ELSE
    -- User has not reacted - enforce per-emote cap before adding.
    IF jsonb_array_length(v_users) >= 100 THEN
      RAISE EXCEPTION 'Reaction cap reached for emote "%" (max 100)', p_emote
        USING ERRCODE = 'check_violation';
    END IF;

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
  'p_provider defaults to "hivecom"; any provider key up to 64 characters is accepted. '
  'p_emote can be any string up to 32 characters (typically a Unicode emoji). '
  'Adds are rejected when the emote array already has 100 entries (cap is '
  'per-emote per-row). Removals are always allowed. '
  'Front-ends decide which emotes to display; unknown emotes are dropped at '
  'the display layer. '
  'Returns the updated reactions JSONB for the target row.';
