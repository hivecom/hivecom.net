ALTER TABLE "public"."gameserver_containers"
  ADD COLUMN "uptime" bigint;

ALTER TABLE "public"."gameservers"
  ADD COLUMN "name" text NOT NULL DEFAULT 'Hivecom'::text;

