-- Steam Games Catalogue
-- Passive catalogue of Steam games seen while users are playing.
-- Populated by the steam-games-catalogue cron job.

CREATE TABLE public.steam_games (
  steam_id   bigint      PRIMARY KEY,
  name       text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.steam_games IS 'Passive catalogue of Steam games seen while users are playing. Populated by the steam-games-catalogue cron job.';

COMMENT ON COLUMN public.steam_games.steam_id   IS 'Steam application ID, used as primary key to prevent duplicates';
COMMENT ON COLUMN public.steam_games.name       IS 'Steam game display name';
COMMENT ON COLUMN public.steam_games.updated_at IS 'Timestamp when this record was last upserted';

-- Enable RLS
ALTER TABLE public.steam_games ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow anon SELECT on steam_games"
  ON public.steam_games
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service role all on steam_games"
  ON public.steam_games
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
