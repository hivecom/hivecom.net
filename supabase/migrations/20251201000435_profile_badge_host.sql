-- Add the new host badge without failing when rerun locally
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_enum e
			JOIN pg_type t ON t.oid = e.enumtypid
		WHERE t.typname = 'profile_badge'
			AND e.enumlabel = 'host'
	) THEN
		ALTER TYPE public.profile_badge ADD VALUE 'host';
	END IF;
END
$$;
