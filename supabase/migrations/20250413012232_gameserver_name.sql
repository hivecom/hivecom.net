ALTER TABLE "public"."gameserver_containers" add column "uptime" bigint;

ALTER TABLE "public"."gameservers" add column "name" text not null default 'Hivecom'::text;


