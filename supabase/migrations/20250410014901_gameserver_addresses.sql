ALTER TABLE "public"."gameservers" drop column "address";

ALTER TABLE "public"."gameservers" add column "addresses" text[];

ALTER TABLE "public"."gameservers" alter column "created_by" set not null;

ALTER TABLE "public"."gameservers" add column "admininstrator" uuid;

ALTER TABLE "public"."gameservers" add constraint "gameservers_admininstrator_fkey" FOREIGN KEY (admininstrator) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

ALTER TABLE "public"."gameservers" validate constraint "gameservers_admininstrator_fkey";


