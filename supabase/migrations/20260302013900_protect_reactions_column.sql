-- Protect the reactions column from direct user writes.
--
-- Problems addressed
-- ──────────────────
-- 1. RLS UPDATE policies on discussions / discussion_replies allow the row
--    owner to UPDATE any column, including reactions.  A user could bypass
--    toggle_reaction entirely and write arbitrary UUIDs into the reactions
--    object for any emote (e.g. faking other users' reactions on their own
--    posts, or wiping everyone's reactions).
--
-- 2. toggle_reaction accepted any p_provider string from an authenticated
--    user, meaning someone could write {"xdd": {"PogChamp": [...]}} directly
--    from the browser.  External providers must only be written by trusted
--    server-side paths (Edge Functions using the service role).
--
-- Solution
-- ────────
-- A. A BEFORE UPDATE trigger on both tables blocks any direct write to the
--    reactions column unless:
--      • The session GUC app.reactions_rpc_active is set to 'true'
--        (toggle_reaction sets this for its own transaction), OR
--      • The caller holds the discussions.manage permission (admin / mod).
--
--    This means the only two legitimate write paths are:
--      1. toggle_reaction RPC  - sets the GUC, allowed for all authenticated users.
--      2. Privileged direct UPDATE - admins/mods only, for moderation purposes.
--
-- B. toggle_reaction now rejects any provider other than 'hivecom'.  External
--    providers (xdd, etc.) must be written via a dedicated privileged RPC or
--    Edge Function that uses the service role and bypasses this trigger.

-- ─────────────────────────────────────────────
-- A. Trigger: block direct reactions writes
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_reactions_column()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when reactions is actually being changed.
  IF OLD.reactions IS NOT DISTINCT FROM NEW.reactions THEN
    RETURN NEW;
  END IF;

  -- Allow writes that originate from inside toggle_reaction.
  -- The RPC sets this local GUC at the start of its transaction; it is
  -- automatically cleared when the transaction ends so it cannot leak.
  IF pg_catalog.current_setting('app.reactions_rpc_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow admins and moderators to modify reactions directly (e.g. to remove
  -- an abusive reaction during moderation).
  IF public.authorize('discussions.manage'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Direct writes to the reactions column are not permitted. '
    'Use the toggle_reaction RPC instead.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.protect_reactions_column() IS
  'Blocks direct UPDATE of the reactions column by regular users. '
  'Writes are only permitted when they originate from the toggle_reaction RPC '
  '(identified via the app.reactions_rpc_active session GUC) or from a user '
  'with the discussions.manage permission.';

CREATE TRIGGER protect_discussions_reactions
  BEFORE UPDATE OF reactions ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_reactions_column();

CREATE TRIGGER protect_discussion_replies_reactions
  BEFORE UPDATE OF reactions ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_reactions_column();

-- ─────────────────────────────────────────────
-- B. Update toggle_reaction: set the bypass GUC
--    and lock to hivecom provider only
-- ─────────────────────────────────────────────

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

  -- ── Provider allow-list ───────────────────────────────────────────────────
  -- Only the built-in hivecom provider is available to end users.
  -- External providers (xdd, etc.) must be written by a trusted server-side
  -- path using the service role - never directly from the browser.
  IF p_provider <> 'hivecom' THEN
    RAISE EXCEPTION
      'Provider "%" is not available via this endpoint. '
      'External providers must be written through a privileged server-side path.',
      p_provider
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── Emote allow-list ──────────────────────────────────────────────────────
  IF NOT (p_emote = ANY(public.get_allowed_hivecom_emotes())) THEN
    RAISE EXCEPTION 'Emote "%" is not in the hivecom allow-list', p_emote
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
    -- User already reacted → remove them
    SELECT jsonb_agg(el)
    INTO   v_users
    FROM   jsonb_array_elements(v_users) AS el
    WHERE  el <> to_jsonb(v_user_str);

    -- jsonb_agg returns NULL for an empty result set
    v_users := COALESCE(v_users, '[]'::jsonb);
  ELSE
    -- User has not reacted → add them
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
  'Only the "hivecom" provider is accepted; external providers must be written '
  'via a privileged server-side path. '
  'Returns the updated reactions JSONB for the target row.';
