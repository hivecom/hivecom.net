-- =============================================================================
-- profile_badges_table
-- =============================================================================
-- Introduces a unified badge ownership table that becomes the single source of
-- truth for all badges (manual, flag-driven, and computed).
--
-- What this migration does:
--   1. Creates badge_tier and badge_source enums.
--   2. Creates profile_badge_definitions - the catalog table.
--   3. Creates profile_badges - one row per (profile, badge slug).
--   4. Grants + RLS: public read, service_role write, two admin RPCs.
--   5. Internal helpers in private schema (upsert, remove, compute tier).
--   6. Public recompute functions + recompute_all_profile_badges RPC.
--   7. Admin RPCs: admin_set_profile_badge, admin_remove_profile_badge.
--   8. Trigger functions (public, trigger_ prefix) + triggers.
--   9. Backfills existing data from profiles.badges, supporter flags,
--      and created_at so the table is fully populated immediately.
--  10. Daily cron to advance one_of_us tiers on anniversary.
--
-- NOTE: profiles.badges (the old enum array column) is intentionally left
-- untouched here. A follow-up migration will drop it once all reads have
-- migrated to profile_badges.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.badge_tier AS ENUM ('bronze', 'silver', 'gold', 'shiny');

CREATE TYPE public.badge_source AS ENUM ('manual', 'flag', 'computed');

-- ---------------------------------------------------------------------------
-- 2. Badge definitions catalog
-- ---------------------------------------------------------------------------

CREATE TABLE public.profile_badge_definitions (
    slug        text                    NOT NULL PRIMARY KEY,
    kind        public.badge_source     NOT NULL,
    sort_order  integer                 NOT NULL DEFAULT 0,
    is_active   boolean                 NOT NULL DEFAULT true,
    created_at  timestamptz             NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_badge_definitions IS
    'Catalog of all badge types. slug is the canonical identifier. '
    'kind drives how the badge is awarded (manual/flag/computed). '
    'Deactivating a badge (is_active = false) hides it without dropping data.';

-- sort_order: lower = rendered first within a tier.
INSERT INTO public.profile_badge_definitions (slug, kind, sort_order) VALUES
    ('founder',              'manual',   10),
    ('earlybird',            'manual',   20),
    ('supporter_lifetime',   'flag',     30),
    ('supporter',            'flag',     40),
    ('host',                 'manual',   50),
    ('builder',              'manual',   60),
    ('one_of_us',            'computed', 70),
    ('party_animal',         'computed', 80),
    ('forum_regular',        'computed', 90),
    ('chatterbox',           'computed', 100);

-- ---------------------------------------------------------------------------
-- 3. Profile badges table
-- ---------------------------------------------------------------------------

CREATE TABLE public.profile_badges (
    profile_id  uuid                    NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    slug        text                    NOT NULL REFERENCES public.profile_badge_definitions (slug) ON DELETE CASCADE,
    tier        public.badge_tier       NOT NULL DEFAULT 'bronze',
    progress    integer,                -- raw value that determined the tier (count, years, etc.)
    metadata    jsonb                   NOT NULL DEFAULT '{}'::jsonb,
    source      public.badge_source     NOT NULL,
    earned_at   timestamptz             NOT NULL DEFAULT now(),
    updated_at  timestamptz             NOT NULL DEFAULT now(),

    PRIMARY KEY (profile_id, slug)
);

COMMENT ON TABLE public.profile_badges IS
    'One row per (profile, badge). Single source of truth for all badges a '
    'user has earned, regardless of whether they were manually granted, '
    'derived from a profile flag, or computed from activity counts.';

CREATE INDEX ON public.profile_badges (slug, tier);
CREATE INDEX ON public.profile_badges (profile_id) INCLUDE (slug, tier, progress);

-- ---------------------------------------------------------------------------
-- 4. RLS + grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.profile_badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badges            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read profile_badge_definitions"
    ON public.profile_badge_definitions FOR SELECT USING (true);

CREATE POLICY "public read profile_badges"
    ON public.profile_badges FOR SELECT USING (true);

GRANT SELECT ON public.profile_badge_definitions TO anon, authenticated;
GRANT SELECT ON public.profile_badges            TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.upsert_profile_badge(
    p_profile_id  uuid,
    p_slug        text,
    p_tier        public.badge_tier,
    p_source      public.badge_source,
    p_progress    integer  DEFAULT NULL,
    p_metadata    jsonb    DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    INSERT INTO public.profile_badges (profile_id, slug, tier, source, progress, metadata, earned_at, updated_at)
    VALUES (p_profile_id, p_slug, p_tier, p_source, p_progress, p_metadata, now(), now())
    ON CONFLICT (profile_id, slug) DO UPDATE SET
        tier       = EXCLUDED.tier,
        source     = EXCLUDED.source,
        progress   = EXCLUDED.progress,
        metadata   = EXCLUDED.metadata,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.remove_profile_badge(p_profile_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    DELETE FROM public.profile_badges WHERE profile_id = p_profile_id AND slug = p_slug;
END;
$$;

CREATE OR REPLACE FUNCTION private.compute_count_badge_tier(
    p_count              integer,
    p_threshold_shiny    integer,
    p_threshold_gold     integer,
    p_threshold_silver   integer,
    p_threshold_bronze   integer
)
RETURNS public.badge_tier
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT CASE
        WHEN p_threshold_shiny  IS NOT NULL AND p_count >= p_threshold_shiny  THEN 'shiny'::public.badge_tier
        WHEN p_threshold_gold   IS NOT NULL AND p_count >= p_threshold_gold   THEN 'gold'::public.badge_tier
        WHEN p_threshold_silver IS NOT NULL AND p_count >= p_threshold_silver THEN 'silver'::public.badge_tier
        WHEN p_threshold_bronze IS NOT NULL AND p_count >= p_threshold_bronze THEN 'bronze'::public.badge_tier
        ELSE NULL
    END
$$;

-- ---------------------------------------------------------------------------
-- 6. Public recompute functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_party_animal_badge(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
    v_count integer;
    v_tier  public.badge_tier;
BEGIN
    SELECT COUNT(*)::integer INTO v_count
    FROM public.event_rsvps
    WHERE user_id = p_profile_id AND rsvp = 'yes';

    v_tier := private.compute_count_badge_tier(v_count, NULL, 50, 10, 3);

    IF v_tier IS NULL THEN
        PERFORM private.remove_profile_badge(p_profile_id, 'party_animal');
    ELSE
        PERFORM private.upsert_profile_badge(p_profile_id, 'party_animal', v_tier, 'computed', v_count);
    END IF;
END;
$$;

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
    SELECT COUNT(*)::integer INTO v_count
    FROM public.discussions
    WHERE created_by = p_profile_id AND is_archived = false AND is_draft = false;

    v_tier := private.compute_count_badge_tier(v_count, NULL, 1000, 100, 10);

    IF v_tier IS NULL THEN
        PERFORM private.remove_profile_badge(p_profile_id, 'forum_regular');
    ELSE
        PERFORM private.upsert_profile_badge(p_profile_id, 'forum_regular', v_tier, 'computed', v_count);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_chatterbox_badge(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
    v_count integer;
    v_tier  public.badge_tier;
BEGIN
    SELECT COUNT(*)::integer INTO v_count
    FROM public.discussion_replies
    WHERE created_by = p_profile_id AND is_deleted = false;

    v_tier := private.compute_count_badge_tier(v_count, NULL, 10000, 1000, 100);

    IF v_tier IS NULL THEN
        PERFORM private.remove_profile_badge(p_profile_id, 'chatterbox');
    ELSE
        PERFORM private.upsert_profile_badge(p_profile_id, 'chatterbox', v_tier, 'computed', v_count);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_one_of_us_badge(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
    v_created_at timestamptz;
    v_years      integer;
    v_tier       public.badge_tier;
BEGIN
    SELECT created_at INTO v_created_at FROM public.profiles WHERE id = p_profile_id;
    IF v_created_at IS NULL THEN RETURN; END IF;

    v_years := EXTRACT(YEAR FROM age(now(), v_created_at))::integer;
    v_tier  := private.compute_count_badge_tier(v_years, 20, 10, 5, 1);

    IF v_tier IS NULL THEN
        PERFORM private.remove_profile_badge(p_profile_id, 'one_of_us');
    ELSE
        PERFORM private.upsert_profile_badge(
            p_profile_id, 'one_of_us', v_tier, 'computed', v_years,
            jsonb_build_object('member_since', v_created_at)
        );
    END IF;
END;
$$;

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
    PERFORM public.recompute_one_of_us_badge(p_profile_id);
END;
$$;

COMMENT ON FUNCTION public.recompute_all_profile_badges(uuid) IS
    'Recomputes all computed profile badges for the given profile. Idempotent.';

REVOKE EXECUTE ON FUNCTION public.recompute_all_profile_badges(uuid)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_party_animal_badge(uuid)     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_forum_regular_badge(uuid)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_chatterbox_badge(uuid)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_one_of_us_badge(uuid)        FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_profile_badge(
    p_profile_id  uuid,
    p_slug        text,
    p_tier        public.badge_tier DEFAULT 'bronze'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    IF NOT public.has_permission('users.update'::public.app_permission) THEN
        RAISE EXCEPTION 'Insufficient permissions to grant badges';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profile_badge_definitions WHERE slug = p_slug AND kind = 'manual'
    ) THEN
        RAISE EXCEPTION 'Badge slug % is not a manual badge', p_slug;
    END IF;
    PERFORM private.upsert_profile_badge(p_profile_id, p_slug, p_tier, 'manual');
END;
$$;

COMMENT ON FUNCTION public.admin_set_profile_badge(uuid, text, public.badge_tier) IS
    'Grants a manual badge to a profile. Requires users.update permission.';

CREATE OR REPLACE FUNCTION public.admin_remove_profile_badge(p_profile_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    IF NOT public.has_permission('users.update'::public.app_permission) THEN
        RAISE EXCEPTION 'Insufficient permissions to remove badges';
    END IF;
    PERFORM private.remove_profile_badge(p_profile_id, p_slug);
END;
$$;

COMMENT ON FUNCTION public.admin_remove_profile_badge(uuid, text) IS
    'Removes any badge from a profile. Requires users.update permission.';

GRANT EXECUTE ON FUNCTION public.admin_set_profile_badge(uuid, text, public.badge_tier) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_profile_badge(uuid, text)                 TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Trigger functions + triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_sync_profile_badge_on_supporter_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    IF NEW.supporter_patreon IS DISTINCT FROM OLD.supporter_patreon THEN
        IF NEW.supporter_patreon THEN
            PERFORM private.upsert_profile_badge(NEW.id, 'supporter', 'gold', 'flag');
        ELSE
            PERFORM private.remove_profile_badge(NEW.id, 'supporter');
        END IF;
    END IF;
    IF NEW.supporter_lifetime IS DISTINCT FROM OLD.supporter_lifetime THEN
        IF NEW.supporter_lifetime THEN
            PERFORM private.upsert_profile_badge(NEW.id, 'supporter_lifetime', 'gold', 'flag');
        ELSE
            PERFORM private.remove_profile_badge(NEW.id, 'supporter_lifetime');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recompute_party_animal_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN PERFORM public.recompute_party_animal_badge(OLD.user_id);
    ELSE PERFORM public.recompute_party_animal_badge(NEW.user_id); END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recompute_forum_regular_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN PERFORM public.recompute_forum_regular_badge(OLD.created_by);
    ELSE PERFORM public.recompute_forum_regular_badge(NEW.created_by); END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recompute_chatterbox_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN PERFORM public.recompute_chatterbox_badge(OLD.created_by);
    ELSE PERFORM public.recompute_chatterbox_badge(NEW.created_by); END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_recompute_party_animal_badge()           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_forum_regular_badge()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_chatterbox_badge()             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_profile_badge_on_supporter_change() FROM anon, authenticated;

CREATE TRIGGER trigger_sync_profile_badge_on_supporter_change
    AFTER UPDATE OF supporter_patreon, supporter_lifetime ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_profile_badge_on_supporter_change();

CREATE TRIGGER trigger_sync_profile_badge_party_animal_on_rsvp
    AFTER INSERT OR DELETE OR UPDATE OF rsvp ON public.event_rsvps
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_party_animal_badge();

CREATE TRIGGER trigger_sync_profile_badge_forum_regular_on_discussion
    AFTER INSERT OR DELETE OR UPDATE OF is_archived, is_draft ON public.discussions
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_forum_regular_badge();

CREATE TRIGGER trigger_sync_profile_badge_chatterbox_on_reply
    AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON public.discussion_replies
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_chatterbox_badge();

-- ---------------------------------------------------------------------------
-- 9. Backfill
-- ---------------------------------------------------------------------------

-- Manual badges from profiles.badges enum array
INSERT INTO public.profile_badges (profile_id, slug, tier, source, earned_at, updated_at)
SELECT
    p.id,
    badge_value::text,
    CASE badge_value::text
        WHEN 'founder'   THEN 'shiny'::public.badge_tier
        WHEN 'earlybird' THEN 'gold'::public.badge_tier
        ELSE 'silver'::public.badge_tier
    END,
    'manual'::public.badge_source,
    p.created_at,
    now()
FROM public.profiles AS p
CROSS JOIN LATERAL unnest(p.badges) AS badge_value
ON CONFLICT (profile_id, slug) DO NOTHING;

-- Flag badges from supporter booleans
INSERT INTO public.profile_badges (profile_id, slug, tier, source, earned_at, updated_at)
SELECT id, 'supporter', 'gold'::public.badge_tier, 'flag'::public.badge_source, created_at, now()
FROM public.profiles WHERE supporter_patreon = true
ON CONFLICT (profile_id, slug) DO NOTHING;

INSERT INTO public.profile_badges (profile_id, slug, tier, source, earned_at, updated_at)
SELECT id, 'supporter_lifetime', 'gold'::public.badge_tier, 'flag'::public.badge_source, created_at, now()
FROM public.profiles WHERE supporter_lifetime = true
ON CONFLICT (profile_id, slug) DO NOTHING;

-- Computed badges for all existing profiles
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id FROM public.profiles LOOP
        PERFORM public.recompute_all_profile_badges(r.id);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Daily cron: advance one_of_us tiers on anniversary
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
    'cron-daily-one-of-us-badge',
    '0 2 * * *',
    $cron$
    DO $body$
    DECLARE r record;
    BEGIN
        FOR r IN
            SELECT id FROM public.profiles
            WHERE
                EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM now())
                AND EXTRACT(DAY FROM created_at) = EXTRACT(DAY FROM now())
                AND created_at <= now() - interval ''1 year''
        LOOP
            PERFORM public.recompute_one_of_us_badge(r.id);
        END LOOP;
    END;
    $body$
    $cron$
);

-- Note: additional REVOKEs for cron/internal functions are in
-- 20260517221156_revoke_internal_function_grants.sql since those functions
-- predate this migration.
