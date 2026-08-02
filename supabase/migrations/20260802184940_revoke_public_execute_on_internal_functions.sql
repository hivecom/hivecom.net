-- Revoke EXECUTE from PUBLIC on the internal functions that 20260517221156
-- meant to lock down.
--
-- That migration revoked from anon and authenticated but not from PUBLIC.
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- anon/authenticated inherit it, so revoking from the roles alone changes
-- nothing. 13 of the 14 functions listed there are still callable today; only
-- custom_access_token_hook is locked down, and that's because Supabase
-- revokes it on its own.
--
-- 20260516030841 got this right for the trigger functions by revoking from
-- `anon, authenticated, public` together. This applies the same treatment to
-- the ones that got missed.
--
-- The exposure that matters most: cron_points_birthday_award and
-- cron_points_loyalty_award both hand out points, and both are reachable
-- through PostgREST by any signed-in user.
--
-- The role revokes are repeated here so the grants are unambiguous from this
-- file alone, and so it stands on its own if replayed into a fresh database.

-- Cron functions
REVOKE EXECUTE ON FUNCTION public.cron_metrics_daily_rollup()  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_points_birthday_award() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_points_loyalty_award()  FROM public, anon, authenticated;

-- Badge recompute functions
REVOKE EXECUTE ON FUNCTION public.recompute_all_profile_badges(uuid)  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_party_animal_badge(uuid)  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_forum_regular_badge(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_chatterbox_badge(uuid)    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_one_of_us_badge(uuid)     FROM public, anon, authenticated;

-- Trigger functions (never user-callable)
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_party_animal_badge()           FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_forum_regular_badge()          FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_chatterbox_badge()             FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_profile_badge_on_supporter_change() FROM public, anon, authenticated;

-- Internal helpers
REVOKE EXECUTE ON FUNCTION public.audit_fields_unchanged(timestamp with time zone, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)                        FROM public, anon, authenticated;
