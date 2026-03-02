-- Add reactions support to discussions and discussion_replies.
--
-- Design
-- ──────
-- reactions is stored as a JSONB column with the following shape:
--
--   {
--     "hivecom": {          ← provider key (future: "xdd", "steam", …)
--       "👍": ["<uuid>", "<uuid>"],   ← emote → array of user UUIDs who reacted
--       "❤️": ["<uuid>"]
--     }
--   }
--
-- Keeping the provider as the top-level key means external reaction sources
-- (e.g. the xdd project) can be merged in without colliding with native ones,
-- and provider data can be stripped / queried independently.
--
-- The "hivecom" provider only allows a fixed emote allow-list (validated by
-- trigger). Future providers may define their own validation rules.
--
-- RPC
-- ───
-- toggle_reaction(target_table, target_id, emote, provider) atomically adds
-- the calling user's UUID to the emote's array, or removes it if already
-- present.  It returns the updated reactions JSONB for the row so the client
-- can optimistically sync without a second round-trip.

-- ─────────────────────────────────────────────
-- 1. Add columns
-- ─────────────────────────────────────────────

ALTER TABLE public.discussions
  ADD COLUMN reactions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.discussion_replies
  ADD COLUMN reactions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.discussions.reactions IS
  'Reactions stored as {provider: {emote: [user_uuid, …]}}. '
  'The "hivecom" provider is validated against an allow-list. '
  'External providers (e.g. "xdd") may be merged in from outside.';

COMMENT ON COLUMN public.discussion_replies.reactions IS
  'Reactions stored as {provider: {emote: [user_uuid, …]}}. '
  'The "hivecom" provider is validated against an allow-list. '
  'External providers (e.g. "xdd") may be merged in from outside.';

-- GIN indexes for fast JSONB containment queries
CREATE INDEX discussions_reactions_gin_idx
  ON public.discussions USING GIN (reactions);

CREATE INDEX discussion_replies_reactions_gin_idx
  ON public.discussion_replies USING GIN (reactions);

-- ─────────────────────────────────────────────
-- 2. Allowed-emote validation (hivecom provider)
-- ─────────────────────────────────────────────

-- The canonical emote set for the built-in "hivecom" provider.
-- Any reaction written under the "hivecom" provider key that does not appear
-- in this array will be rejected by the trigger below.
CREATE OR REPLACE FUNCTION public.get_allowed_hivecom_emotes()
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY[
    '👍', '👎', '❤️', '😂', '😢', '🤔', '🚀', '🎉',
    '💀', '😳', '🤧', '🌡️', '🌞', '✅', '🆒', '💯',
    '💅', '🏳️‍🌈'
  ];
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_allowed_hivecom_emotes() IS
  'Returns the canonical list of emotes permitted under the "hivecom" reactions provider. '
  'Sync with ALLOWED_HIVECOM_EMOTES in app/lib/reactions.ts.';

-- Validate that any emotes written under the "hivecom" key are in the allow-list.
-- Other provider keys are not validated here - they have their own ingestion paths.
CREATE OR REPLACE FUNCTION public.validate_hivecom_reactions()
RETURNS TRIGGER AS $$
DECLARE
  emote       text;
  allowed     text[];
  new_hivecom jsonb;
BEGIN
  new_hivecom := NEW.reactions -> 'hivecom';

  -- Nothing to validate if the provider key is absent
  IF new_hivecom IS NULL OR new_hivecom = 'null'::jsonb THEN
    RETURN NEW;
  END IF;

  allowed := public.get_allowed_hivecom_emotes();

  FOR emote IN SELECT jsonb_object_keys(new_hivecom)
  LOOP
    IF NOT (emote = ANY(allowed)) THEN
      RAISE EXCEPTION
        'Emote "%" is not in the hivecom allow-list', emote
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER validate_discussions_hivecom_reactions
  BEFORE INSERT OR UPDATE OF reactions ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_hivecom_reactions();

CREATE TRIGGER validate_discussion_replies_hivecom_reactions
  BEFORE INSERT OR UPDATE OF reactions ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_hivecom_reactions();

-- ─────────────────────────────────────────────
-- 3. toggle_reaction RPC
-- ─────────────────────────────────────────────

-- Valid target tables for safety; guards against SQL injection via the table
-- name parameter.
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
  v_users     jsonb;      -- current array for this provider+emote as jsonb array
  v_user_str  text;       -- p_id cast to text for jsonb comparison
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

  -- ── Emote allow-list (hivecom provider only) ──────────────────────────────
  IF p_provider = 'hivecom' THEN
    IF NOT (p_emote = ANY(public.get_allowed_hivecom_emotes())) THEN
      RAISE EXCEPTION 'Emote "%" is not in the hivecom allow-list', p_emote
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Fetch current reactions ───────────────────────────────────────────────
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
  -- Path: reactions -> provider -> emote  (array of user-id strings)
  v_user_str := v_user_id::text;
  v_users := COALESCE(v_reactions -> p_provider -> p_emote, '[]'::jsonb);

  IF v_users @> to_jsonb(v_user_str) THEN
    -- User already reacted → remove them
    SELECT jsonb_agg(el)
    INTO   v_users
    FROM   jsonb_array_elements(v_users) AS el
    WHERE  el <> to_jsonb(v_user_str);

    -- jsonb_agg returns NULL when the result is empty
    v_users := COALESCE(v_users, '[]'::jsonb);
  ELSE
    -- User has not reacted → add them
    v_users := v_users || to_jsonb(v_user_str);
  END IF;

  -- Write back: set reactions[provider][emote] = new array.
  --
  -- jsonb_set with create_missing = true only inserts the *leaf* key when
  -- every *parent* key in the path already exists.  When reactions = '{}' and
  -- the path is ARRAY[provider, emote] (two levels deep), the intermediate
  -- provider object does not exist yet, so jsonb_set silently returns the
  -- original value unchanged - the emote is never stored.
  --
  -- Fix: ensure the provider object exists before setting the emote key.
  IF v_users = '[]'::jsonb THEN
    -- Removing a reaction: only touch the structure if the provider key exists.
    IF v_reactions -> p_provider IS NOT NULL THEN
      v_reactions := v_reactions #- ARRAY[p_provider, p_emote];

      -- Drop the provider object entirely if it is now empty.
      IF (v_reactions -> p_provider) = '{}'::jsonb THEN
        v_reactions := v_reactions - p_provider;
      END IF;
    END IF;
  ELSE
    -- Adding a reaction: seed the provider object if absent, then set the emote.
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
  'p_provider defaults to "hivecom"; only emotes in the hivecom allow-list are '
  'accepted for that provider. External providers (e.g. "xdd") bypass the '
  'allow-list but must be written via a trusted server-side path. '
  'Returns the updated reactions JSONB for the target row.';

-- ─────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.toggle_reaction(text, uuid, text, text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_allowed_hivecom_emotes()
  TO authenticated, anon, service_role;
