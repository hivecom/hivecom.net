BEGIN;

-- Recent apps tracking for Steam presence.
--
-- Unlocks personalized game surfaces ("you like this game", "game you haven't
-- played recently") without collecting play history: recent_apps is bounded
-- state on the presence row (newest first, capped by the sync worker), not a
-- time series. current_app_started_at lets the worker gate entries by session
-- length so seconds-long launches never qualify.

ALTER TABLE public.presences_steam
  ADD COLUMN IF NOT EXISTS current_app_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recent_apps jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.presences_steam.current_app_started_at IS 'Timestamp when the current play session began (current_app_id transitioned from null or a different app). Used by worker-sync-steam to gate recent_apps entries by session length.';
COMMENT ON COLUMN public.presences_steam.recent_apps IS 'Short bounded list of recently played games, newest first, capped by worker-sync-steam. Entries: {app_id, app_name, last_played_at}. Only sessions past the minimum length are recorded - deliberately not a full play history.';

COMMIT;
