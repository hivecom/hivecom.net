ALTER TABLE "public"."servers"
  ADD COLUMN "docker_control" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "public"."servers"
  ADD COLUMN "docker_control_secure" boolean NOT NULL DEFAULT TRUE;

ALTER TABLE "public"."servers"
  ADD COLUMN "docker_control_port" int;

ALTER TABLE "public"."servers"
  ADD COLUMN "docker_control_subdomain" text;

ALTER TABLE "public"."containers"
  DROP COLUMN "uptime";

ALTER TABLE "public"."containers"
  DROP COLUMN "addresses";

ALTER TABLE "public"."containers"
  ADD COLUMN "started_at" timestamp with time zone;

