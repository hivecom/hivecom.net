alter table "public"."gameservers" drop column "address";

alter table "public"."gameservers" add column "addresses" text[];

alter table "public"."gameservers" alter column "created_by" set not null;

alter table "public"."gameservers" add column "admininstrator" uuid;

alter table "public"."gameservers" add constraint "gameservers_admininstrator_fkey" FOREIGN KEY (admininstrator) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."gameservers" validate constraint "gameservers_admininstrator_fkey";


