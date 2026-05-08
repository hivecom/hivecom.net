-- Add created_at to data_steam_games so we can track when a game was first observed.
-- Backfill existing rows with updated_at as a reasonable approximation.

ALTER TABLE public.data_steam_games
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.data_steam_games.created_at IS 'Timestamp when this game was first observed via Steam rich presence.';

-- Backfill existing rows: use updated_at as best approximation of first seen
UPDATE public.data_steam_games
  SET created_at = updated_at;
