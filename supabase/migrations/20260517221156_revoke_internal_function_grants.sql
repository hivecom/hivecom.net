-- ---------------------------------------------------------------------------
-- Revoke execute on functions that should never be callable by users,
-- and fix the broken cron-daily-one-of-us-badge command.
-- ---------------------------------------------------------------------------

-- Cron functions
REVOKE EXECUTE ON FUNCTION public.cron_metrics_daily_rollup()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_points_birthday_award()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_points_loyalty_award()    FROM anon, authenticated;

-- Badge recompute functions
REVOKE EXECUTE ON FUNCTION public.recompute_all_profile_badges(uuid)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_party_animal_badge(uuid)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_forum_regular_badge(uuid)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_chatterbox_badge(uuid)      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_one_of_us_badge(uuid)       FROM anon, authenticated;

-- Trigger functions (never user-callable)
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_party_animal_badge()              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_forum_regular_badge()             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_chatterbox_badge()                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_profile_badge_on_supporter_change()    FROM anon, authenticated;

-- Internal helpers
REVOKE EXECUTE ON FUNCTION public.audit_fields_unchanged(timestamp with time zone, uuid)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)                         FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fix cron-daily-one-of-us-badge: was referencing the dropped
-- public._recompute_one_of_us_badge, now calls the correct function.
-- ---------------------------------------------------------------------------

SELECT cron.unschedule('cron-daily-one-of-us-badge');

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
                AND created_at <= now() - interval '1 year'
        LOOP
            PERFORM public.recompute_one_of_us_badge(r.id);
        END LOOP;
    END;
    $body$
    $cron$
);
