-- Cron functions should only be callable by postgres/service_role.
-- Revoke EXECUTE from authenticated so signed-in users cannot invoke
-- them directly via /rest/v1/rpc/.
REVOKE EXECUTE ON FUNCTION public.cron_metrics_daily_rollup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_points_birthday_award() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_points_loyalty_award() FROM authenticated;
