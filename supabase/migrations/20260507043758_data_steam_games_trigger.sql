-- Trigger to passively populate data_steam_games whenever a Steam presence row
-- is inserted or updated with a non-null current_app_id and current_app_name.
-- Only fires for users with rich_presence_enabled to match the opt-in gate.

CREATE OR REPLACE FUNCTION public.upsert_data_steam_game()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  -- Only proceed when we have both an app ID and name
  IF NEW.current_app_id IS NULL OR NEW.current_app_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only track games for users who have opted into rich presence
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.profile_id
      AND rich_presence_enabled = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.data_steam_games (steam_id, name, updated_at)
  VALUES (NEW.current_app_id, NEW.current_app_name, now())
  ON CONFLICT (steam_id)
  DO UPDATE SET
    name       = EXCLUDED.name,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.upsert_data_steam_game() IS 'Upserts a row into data_steam_games when a presence_steam row is written with a known current app. Only runs for opt-in users.';

CREATE TRIGGER on_steam_presence_upsert_game
  AFTER INSERT OR UPDATE OF current_app_id, current_app_name
  ON public.presences_steam
  FOR EACH ROW
  EXECUTE FUNCTION public.upsert_data_steam_game();
