-- When a user unlinks their Steam account (steam_id set to null),
-- delete their presences_steam row so stale game activity is not counted.

CREATE OR REPLACE FUNCTION public.delete_steam_presence_on_unlink()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  IF OLD.steam_id IS NOT NULL AND NEW.steam_id IS NULL THEN
    DELETE FROM public.presences_steam
    WHERE profile_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.delete_steam_presence_on_unlink() IS 'Deletes presences_steam row when a user unlinks their Steam account.';

CREATE TRIGGER on_steam_id_unlink
  AFTER UPDATE OF steam_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_steam_presence_on_unlink();
