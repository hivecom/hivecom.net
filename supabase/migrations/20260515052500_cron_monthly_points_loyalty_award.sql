-- Creates the monthly loyalty points award function and schedules it via pg_cron.
-- Reads `points_per_month_loyalty` from kvstore (falls back to 0 if not set).
-- Awards points to profiles seen within the last 30 days.
-- Upserts profile_points.points_loyalty and writes a profile_point_history row per award.

CREATE OR REPLACE FUNCTION public.cron_monthly_points_loyalty_award()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_rate       int;
  v_profile    RECORD;
  v_awarded    int := 0;
BEGIN
  -- Read loyalty points rate from KV store; fall back to 0 (no-op) if not configured
  SELECT COALESCE((value::text)::int, 0)
    INTO v_rate
  FROM public.kvstore
  WHERE key = 'points_per_month_loyalty'
  LIMIT 1;

  IF v_rate IS NULL THEN
    v_rate := 0;
  END IF;

  IF v_rate = 0 THEN
    RAISE NOTICE 'cron_monthly_points_loyalty_award: rate is 0, nothing to award';
    RETURN;
  END IF;

  -- Award loyalty points to all profiles seen within the last 30 days
  FOR v_profile IN
    SELECT id
    FROM public.profiles
    WHERE last_seen >= NOW() - INTERVAL '30 days'
  LOOP
    -- Each profile award is atomic: points + history succeed or both roll back.
    -- Errors are logged and the loop continues to the next profile.
    BEGIN
      INSERT INTO public.profile_points (profile_id, points_loyalty)
      VALUES (v_profile.id, v_rate)
      ON CONFLICT (profile_id) DO UPDATE
        SET points_loyalty = profile_points.points_loyalty + EXCLUDED.points_loyalty,
            modified_at    = NOW();

      INSERT INTO public.profile_point_history (profile_id, amount, source)
      VALUES (v_profile.id, v_rate, 'loyalty');

      v_awarded := v_awarded + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron_monthly_points_loyalty_award: failed for profile % - %', v_profile.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'cron_monthly_points_loyalty_award: awarded % points to % profiles', v_rate, v_awarded;
END;
$$;

-- Schedule: 1st of every month at 00:00 UTC
SELECT cron.schedule(
  'cron-monthly-points-loyalty-award',
  '0 0 1 * *',
  'SELECT public.cron_monthly_points_loyalty_award()'
);
