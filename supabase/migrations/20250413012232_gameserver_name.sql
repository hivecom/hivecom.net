alter table "public"."gameserver_containers" add column "uptime" bigint;

alter table "public"."gameservers" add column "name" text not null default 'Hivecom'::text;


