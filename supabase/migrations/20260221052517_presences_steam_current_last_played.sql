BEGIN;

ALTER TABLE public.presences_steam
  ADD COLUMN IF NOT EXISTS current_app_id bigint,
  ADD COLUMN IF NOT EXISTS current_app_name text;

COMMENT ON COLUMN public.presences_steam.current_app_id IS 'Current Steam game app ID when actively playing.';
COMMENT ON COLUMN public.presences_steam.current_app_name IS 'Current Steam game name when actively playing.';

CREATE INDEX IF NOT EXISTS presences_steam_current_app_id_idx
  ON public.presences_steam (current_app_id);

UPDATE public.presences_steam
SET
  current_app_id = COALESCE(current_app_id, last_app_id),
  current_app_name = COALESCE(current_app_name, last_app_name);

COMMIT;
