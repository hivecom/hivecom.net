-- Sync profile ban fields from auth.users so auth remains the source of truth
CREATE OR REPLACE FUNCTION public.sync_profile_ban_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  ban_reason text;
  ban_start timestamptz;
  ban_end timestamptz;
  is_banned boolean;
BEGIN
  ban_reason := NULLIF(meta->>'ban_reason', '');
  ban_start := (meta->>'ban_start')::timestamptz;
  ban_end := (meta->>'ban_end')::timestamptz;

  IF ban_end IS NULL THEN
    ban_end := NEW.banned_until;
  END IF;

  is_banned := NEW.banned_until IS NOT NULL AND NEW.banned_until > NOW();

  UPDATE public.profiles p
  SET banned = is_banned,
      ban_reason = CASE WHEN is_banned THEN ban_reason ELSE NULL END,
      ban_start = CASE WHEN is_banned THEN COALESCE(ban_start, p.ban_start, NOW()) ELSE NULL END,
      ban_end = CASE WHEN is_banned THEN ban_end ELSE NULL END
  WHERE p.id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_profile_ban_from_auth ON auth.users;
CREATE TRIGGER trigger_sync_profile_ban_from_auth
AFTER UPDATE OF banned_until, raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_ban_from_auth();
