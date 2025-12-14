-- Prevent reverting username_set to false after it has been set to true
CREATE OR REPLACE FUNCTION public.prevent_username_set_regression()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.username_set = TRUE AND NEW.username_set = FALSE THEN
    RAISE EXCEPTION 'username_set cannot be reverted to false once set to true';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_username_set_regression ON public.profiles;

CREATE TRIGGER prevent_username_set_regression
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_username_set_regression();

