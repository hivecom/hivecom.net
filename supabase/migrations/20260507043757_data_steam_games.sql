-- Passive catalogue of Steam games seen while users have rich presence enabled.
-- Populated by a trigger on presences_steam whenever current_app_id/current_app_name change.

CREATE TABLE public.data_steam_games (
  steam_id   bigint      PRIMARY KEY,
  name       text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.data_steam_games            IS 'Passive catalogue of Steam games observed via rich presence. One row per Steam app ID.';
COMMENT ON COLUMN public.data_steam_games.steam_id   IS 'Steam application ID, used as primary key to prevent duplicates.';
COMMENT ON COLUMN public.data_steam_games.name       IS 'Steam game display name as reported by the Steam API.';
COMMENT ON COLUMN public.data_steam_games.updated_at IS 'Timestamp when this record was last upserted.';

ALTER TABLE public.data_steam_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon SELECT on data_steam_games"
  ON public.data_steam_games
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service role all on data_steam_games"
  ON public.data_steam_games
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
