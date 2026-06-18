-- =============================================================================
-- align_forum_regular_badge_with_discussion_count
-- =============================================================================
-- The "Forum Regular" badge ("Started X forum discussions") disagreed with the
-- profile card discussion counter (useDataUserDiscussionCount). They filtered
-- discussions differently:
--
--   card counter:  created_by = me AND is_draft = false AND profile_id IS NULL
--   badge (old):   created_by = me AND is_draft = false AND is_archived = false
--
-- So the badge wrongly counted profile wall posts (profile_id IS NOT NULL) and
-- wrongly dropped archived threads. This realigns the badge to the card's
-- definition: a forum discussion you started is any non-draft discussion that
-- is not a profile wall post. Archived threads still count.
--
-- What this migration does:
--   1. Replaces recompute_forum_regular_badge to match the card predicate.
--   2. Realigns the sync trigger to watch the columns the new predicate
--      depends on (is_draft, profile_id) instead of (is_archived, is_draft).
--   3. Backfills the badge for all existing profiles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Recompute function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_forum_regular_badge(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
    v_count integer;
    v_tier  public.badge_tier;
BEGIN
    -- Forum discussions the user started: non-draft, not a profile wall post.
    -- Archived threads still count. Mirrors useDataUserDiscussionCount.
    SELECT COUNT(*)::integer INTO v_count
    FROM public.discussions
    WHERE created_by = p_profile_id AND is_draft = false AND profile_id IS NULL;

    v_tier := private.compute_count_badge_tier(v_count, NULL, 1000, 100, 10);

    IF v_tier IS NULL THEN
        PERFORM private.remove_profile_badge(p_profile_id, 'forum_regular');
    ELSE
        PERFORM private.upsert_profile_badge(p_profile_id, 'forum_regular', v_tier, 'computed', v_count);
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_forum_regular_badge(uuid) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Realign the sync trigger to the new predicate's columns
-- ---------------------------------------------------------------------------
-- The count now depends on is_draft and profile_id, not is_archived. INSERT and
-- DELETE fire regardless of columns; the column list only narrows UPDATE.

DROP TRIGGER IF EXISTS trigger_sync_profile_badge_forum_regular_on_discussion ON public.discussions;

CREATE TRIGGER trigger_sync_profile_badge_forum_regular_on_discussion
    AFTER INSERT OR DELETE OR UPDATE OF is_draft, profile_id ON public.discussions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_forum_regular_badge();

-- ---------------------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id FROM public.profiles LOOP
        PERFORM public.recompute_forum_regular_badge(r.id);
    END LOOP;
END;
$$;
