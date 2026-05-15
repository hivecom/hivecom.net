-- Birthday points award.
--
-- Adds:
--   - birthday enum value to point_source
--   - points_birthday column to profile_points (included in points_total)
--   - cron_points_birthday_award() DB function
--   - cron-points-birthday-award pg_cron job (daily at 01:00 UTC)
--
-- Gating: a profile is only awarded once per 365 days, checked via
-- profile_point_history. Changing the birthday field has no effect on
-- eligibility - the history ledger is the source of truth.

-- -----------------------------------------------------------------------
-- 1. Add birthday to point_source enum
-- --------------------------------------------------------------------
ALTER TYPE public.point_source ADD VALUE IF NOT EXISTS 'birthday';

-- -----------------------------------------------------------------------
-- 2. Add points_birthday column and rebuild points_total
-- --------------------------------------------------------------------
ALTER TABLE public.profile_points
  ADD COLUMN IF NOT EXISTS points_birthday integer NOT NULL DEFAULT 0;

ALTER TABLE public.profile_points DROP COLUMN points_total;

ALTER TABLE public.profile_points
  ADD COLUMN points_total integer GENERATED ALWAYS AS (
    points_donations + points_patreon + points_loyalty + points_birthday - points_spent
  ) STORED;

-- -----------------------------------------------------------------------
-- 3. Birthday award function
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_points_birthday_award()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_rate       int;
  v_profile    RECORD;
  v_awarded    int := 0;
BEGIN
  -- Read birthday points award from KV store; fall back to 1000 if not set
  SELECT COALESCE((value::text)::int, 1000)
    INTO v_rate
  FROM public.kvstore
  WHERE key = 'points_per_birthday'
  LIMIT 1;

  IF v_rate IS NULL THEN
    v_rate := 1000;
  END IF;

  IF v_rate = 0 THEN
    RAISE NOTICE 'cron_points_birthday_award: rate is 0, nothing to award';
    RETURN;
  END IF;

  -- Award points to profiles whose birthday month+day matches today,
  -- skipping any profile already awarded birthday points within 365 days.
  FOR v_profile IN
    SELECT p.id
    FROM public.profiles p
    WHERE
      p.birthday IS NOT NULL
      AND EXTRACT(month FROM p.birthday) = EXTRACT(month FROM NOW() AT TIME ZONE 'UTC')
      AND EXTRACT(day   FROM p.birthday) = EXTRACT(day   FROM NOW() AT TIME ZONE 'UTC')
      AND NOT EXISTS (
        SELECT 1
        FROM public.profile_point_history h
        WHERE h.profile_id = p.id
          AND h.source     = 'birthday'
          AND h.created_at >= NOW() - INTERVAL '365 days'
      )
  LOOP
    BEGIN
      INSERT INTO public.profile_points (profile_id, points_birthday)
      VALUES (v_profile.id, v_rate)
      ON CONFLICT (profile_id) DO UPDATE
        SET points_birthday = profile_points.points_birthday + EXCLUDED.points_birthday,
            modified_at     = NOW();

      INSERT INTO public.profile_point_history (profile_id, amount, source)
      VALUES (v_profile.id, v_rate, 'birthday');

      v_awarded := v_awarded + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron_points_birthday_award: failed for profile % - %', v_profile.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'cron_points_birthday_award: awarded % points to % profiles', v_rate, v_awarded;
END;
$$;

-- -----------------------------------------------------------------------
-- 4. Schedule daily at 01:00 UTC
-- --------------------------------------------------------------------
SELECT cron.schedule(
  'cron-points-birthday-award',
  '0 1 * * *',
  'SELECT public.cron_points_birthday_award()'
);
