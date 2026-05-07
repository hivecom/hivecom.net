-- Drop the previously created steam_games table and its daily cron job.
-- Both are superseded by data_steam_games and a presences_steam trigger.

DO $$
BEGIN
  PERFORM cron.unschedule('daily-steam-games-catalogue');
EXCEPTION
  WHEN others THEN
    NULL; -- job did not exist, nothing to do
END;
$$;

DROP TABLE IF EXISTS public.steam_games;
