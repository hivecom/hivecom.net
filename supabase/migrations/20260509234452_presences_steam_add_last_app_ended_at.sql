ALTER TABLE public.presences_steam
  ADD COLUMN IF NOT EXISTS last_app_ended_at timestamptz;

COMMENT ON COLUMN public.presences_steam.last_app_ended_at IS 'Timestamp when the user was last observed to have stopped playing (current_app_id transitioned to null or a different app). Used for short-session detection in metrics.';
