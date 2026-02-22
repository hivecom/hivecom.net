ALTER TABLE "public"."servers"
  ADD COLUMN "accessible" boolean NOT NULL DEFAULT TRUE;

ALTER TABLE "public"."servers"
  ADD COLUMN "last_accessed" timestamp with time zone;

COMMENT ON COLUMN "public"."servers"."accessible" IS 'Whether Docker Control can currently access this server';
COMMENT ON COLUMN "public"."servers"."last_accessed" IS 'Last successful Docker Control access timestamp';
