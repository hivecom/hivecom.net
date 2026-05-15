-- Rename loyalty award function and cron job to the cron_points_ convention.
--
-- cron_monthly_points_loyalty_award() -> cron_points_loyalty_award()
-- cron-monthly-points-loyalty-award   -> cron-points-loyalty-award

ALTER FUNCTION public.cron_monthly_points_loyalty_award() RENAME TO cron_points_loyalty_award;

SELECT cron.unschedule('cron-monthly-points-loyalty-award');
SELECT cron.schedule(
  'cron-points-loyalty-award',
  '0 0 1 * *',
  'SELECT public.cron_points_loyalty_award()'
);
