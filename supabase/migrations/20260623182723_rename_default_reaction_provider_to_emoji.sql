-- Rename the default reaction provider from "hivecom" to "emoji".
--
-- The reaction picker now sources the full Unicode emoji set rather than a
-- curated hivecom manifest, so "emoji" describes the provider better than the
-- old first-party "hivecom" key. Front-ends already pass the provider
-- explicitly, but we realign the RPC default for consistency and back-fill the
-- existing stored data so old reactions keep rendering under the new key.
--
-- Two parts, one logical change:
--   1. toggle_reaction default p_provider -> 'emoji' (body otherwise unchanged
--      from 20260316000000 + the search_path hardening from 20260516030947).
--   2. Merge the legacy "hivecom" provider into "emoji" on both base tables.
--
-- No structural change to the JSONB shape { provider: { emote: [uuid, ...] } }.

-- ─────────────────────────────────────────────
-- 1. Realign toggle_reaction default to "emoji"
-- ─────────────────────────────────────────────
-- Keeps the per-emote reactor cap (100) and SET search_path TO '' that the
-- current production function already carries. Only the default provider and
-- the doc comment change.

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_table    text,
  p_id       uuid,
  p_emote    text,
  p_provider text DEFAULT 'emoji'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;

COMMENT ON FUNCTION public.toggle_reaction(text, uuid, text, text) IS
  'Atomically add or remove the calling user''s reaction on a discussion or '
  'discussion_reply row. '
  'p_table must be "discussions" or "discussion_replies". '
  'p_provider defaults to "emoji"; any provider key up to 64 characters is accepted. '
  'p_emote can be any string up to 32 characters (typically a Unicode emoji). '
  'Adds are rejected when the emote array already has 100 entries (cap is '
  'per-emote per-row). Removals are always allowed. '
  'Front-ends decide which emotes to display; unknown emotes are dropped at '
  'the display layer. '
  'Returns the updated reactions JSONB for the target row.';

-- ─────────────────────────────────────────────
-- 2. Back-fill: merge "hivecom" provider into "emoji"
-- ─────────────────────────────────────────────
-- The reactions column is guarded by the protect_reactions_column trigger.
-- Set the same session flag the RPC uses so these writes are allowed through.
-- This relies on the migration running inside a single transaction (the
-- Supabase migration runner does this); SET LOCAL clears at COMMIT.
SET LOCAL app.reactions_rpc_active = 'true';

-- Handles rows that have only hivecom, only emoji, or both: per-emote reactor
-- arrays are concatenated and de-duplicated. Any other providers (e.g. "xdd")
-- are left untouched. Idempotent - a re-run finds no "hivecom" key and is a
-- no-op.
WITH merged AS (
  SELECT
    d.id,
    CASE
      WHEN m.emoji = '{}'::jsonb
        THEN d.reactions - 'hivecom' - 'emoji'
      ELSE (d.reactions - 'hivecom' - 'emoji') || jsonb_build_object('emoji', m.emoji)
    END AS new_reactions
  FROM public.discussions d
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_object_agg(emote, reactors), '{}'::jsonb) AS emoji
    FROM (
      SELECT e.emote, to_jsonb(array_agg(DISTINCT e.reactor)) AS reactors
      FROM (
        SELECT kv.key AS emote, jsonb_array_elements_text(kv.value) AS reactor
        FROM jsonb_each(COALESCE(d.reactions -> 'emoji', '{}'::jsonb)) kv
        UNION ALL
        SELECT kv.key AS emote, jsonb_array_elements_text(kv.value) AS reactor
        FROM jsonb_each(COALESCE(d.reactions -> 'hivecom', '{}'::jsonb)) kv
      ) e
      GROUP BY e.emote
    ) g
  ) m
  WHERE d.reactions ? 'hivecom'
)
UPDATE public.discussions d
SET reactions = merged.new_reactions
FROM merged
WHERE d.id = merged.id
  AND d.reactions IS DISTINCT FROM merged.new_reactions;

WITH merged AS (
  SELECT
    r.id,
    CASE
      WHEN m.emoji = '{}'::jsonb
        THEN r.reactions - 'hivecom' - 'emoji'
      ELSE (r.reactions - 'hivecom' - 'emoji') || jsonb_build_object('emoji', m.emoji)
    END AS new_reactions
  FROM public.discussion_replies r
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_object_agg(emote, reactors), '{}'::jsonb) AS emoji
    FROM (
      SELECT e.emote, to_jsonb(array_agg(DISTINCT e.reactor)) AS reactors
      FROM (
        SELECT kv.key AS emote, jsonb_array_elements_text(kv.value) AS reactor
        FROM jsonb_each(COALESCE(r.reactions -> 'emoji', '{}'::jsonb)) kv
        UNION ALL
        SELECT kv.key AS emote, jsonb_array_elements_text(kv.value) AS reactor
        FROM jsonb_each(COALESCE(r.reactions -> 'hivecom', '{}'::jsonb)) kv
      ) e
      GROUP BY e.emote
    ) g
  ) m
  WHERE r.reactions ? 'hivecom'
)
UPDATE public.discussion_replies r
SET reactions = merged.new_reactions
FROM merged
WHERE r.id = merged.id
  AND r.reactions IS DISTINCT FROM merged.new_reactions;
