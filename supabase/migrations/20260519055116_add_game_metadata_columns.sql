-- Add metadata columns to the games table

-- Short tagline / display subtitle (plain text, not markdown)
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "description" text;

-- Long-form community markdown description
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "markdown" text;

-- Genre tags (free-form array, e.g. '{"FPS","Survival","Co-op"}')
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "genre_tags" text[];

-- Multiplayer mode tags
-- Using a text[] with an app-level check rather than a DB enum so new values
-- can be added without migrations. Accepted values: pvp, coop, mmo, singleplayer
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "multiplayer_modes" text[];

-- Accent/brand color for theming (hex string, e.g. '#e63946')
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "color" text;

-- Release date for the game. Using a date column allows filtering and display
-- of month/day where relevant without losing year-only precision.
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "release_date" date;

-- FK to a discussion_topics row that serves as the game's community forum topic
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "discussion_topic_id" uuid
  REFERENCES "public"."discussion_topics"("id") ON DELETE SET NULL;

-- Index for the FK
CREATE INDEX IF NOT EXISTS "games_discussion_topic_id_idx"
  ON "public"."games" ("discussion_topic_id");
