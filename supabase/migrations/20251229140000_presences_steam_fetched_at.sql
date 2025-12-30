-- Add fetched_at column to track when Steam data was last refreshed
ALTER TABLE public.presences_steam
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

COMMENT ON COLUMN public.presences_steam.fetched_at IS 'Timestamp when Steam data was last refreshed via sync';

