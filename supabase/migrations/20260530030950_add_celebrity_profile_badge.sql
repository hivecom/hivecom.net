-- =============================================================================
-- add_celebrity_profile_badge
-- =============================================================================
-- Adds the "celebrity" computed badge: awarded based on how many replies a
-- user has received from OTHER people on their profile wall discussion
-- (discussions.profile_id = the user's profile ID). The user's own replies
-- are excluded.
--
-- Thresholds: bronze 10, silver 100, gold 1000.
--
-- What this migration does:
--   1. Registers the badge in profile_badge_definitions.
--   2. Adds recompute_celebrity_badge(uuid) and folds it into
--      recompute_all_profile_badges.
--   3. Adds trigger functions + triggers so the badge stays in sync when
--      replies or discussions change.
--   4. Backfills the badge for all existing profiles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Badge definition
-- ---------------------------------------------------------------------------

INSERT INTO public.profile_badge_definitions (slug, kind, sort_order) VALUES
    ('celebrity', 'computed', 110)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Recompute function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_celebrity_badge(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
    v_count integer;
    v_tier  public.badge_tier;
BEGIN
    -- Replies authored by other users on this profile's wall discussion.
    SELECT COUNT(*)::integer INTO v_count
    FROM public.discussion_replies AS r
    JOIN public.discussions AS d ON d.id = r.discussion_id
    WHERE d.profile_id = p_profile_id
      AND r.is_deleted = false
      AND r.created_by IS DISTINCT FROM p_profile_id;

    v_tier := private.compute_count_badge_tier(v_count, NULL, 1000, 100, 10);

    IF v_tier IS NULL THEN
        PERFORM private.remove_profile_badge(p_profile_id, 'celebrity');
    ELSE
        PERFORM private.upsert_profile_badge(p_profile_id, 'celebrity', v_tier, 'computed', v_count);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_celebrity_badge(uuid) FROM anon, authenticated;

-- Fold celebrity into the aggregate recompute helper.
CREATE OR REPLACE FUNCTION public.recompute_all_profile_badges(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    PERFORM public.recompute_party_animal_badge(p_profile_id);
    PERFORM public.recompute_forum_regular_badge(p_profile_id);
    PERFORM public.recompute_chatterbox_badge(p_profile_id);
    PERFORM public.recompute_celebrity_badge(p_profile_id);
    PERFORM public.recompute_one_of_us_badge(p_profile_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_all_profile_badges(uuid) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trigger functions + triggers
-- ---------------------------------------------------------------------------

-- When a reply changes, recompute the celebrity badge for the profile whose
-- wall discussion the reply belongs to.
CREATE OR REPLACE FUNCTION public.trigger_recompute_celebrity_badge_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
    v_profile_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT profile_id INTO v_profile_id FROM public.discussions WHERE id = OLD.discussion_id;
    ELSE
        SELECT profile_id INTO v_profile_id FROM public.discussions WHERE id = NEW.discussion_id;
    END IF;

    IF v_profile_id IS NOT NULL THEN
        PERFORM public.recompute_celebrity_badge(v_profile_id);
    END IF;
    RETURN NULL;
END;
$$;

-- When a profile wall discussion is deleted, recompute the owning profile so
-- their received-reply count drops accordingly.
CREATE OR REPLACE FUNCTION public.trigger_recompute_celebrity_badge_on_discussion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    -- Only act on profile wall discussions (profile_id IS NOT NULL).
    IF TG_OP = 'DELETE' AND OLD.profile_id IS NOT NULL THEN
        PERFORM public.recompute_celebrity_badge(OLD.profile_id);
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_recompute_celebrity_badge_on_reply()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_celebrity_badge_on_discussion() FROM anon, authenticated;

CREATE TRIGGER trigger_sync_profile_badge_celebrity_on_reply
    AFTER INSERT OR DELETE OR UPDATE OF is_deleted, discussion_id, created_by ON public.discussion_replies
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_celebrity_badge_on_reply();

CREATE TRIGGER trigger_sync_profile_badge_celebrity_on_discussion
    AFTER DELETE ON public.discussions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_celebrity_badge_on_discussion();

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id FROM public.profiles LOOP
        PERFORM public.recompute_celebrity_badge(r.id);
    END LOOP;
END;
$$;
