ALTER TABLE "public"."gameservers"
  DROP COLUMN "address";

ALTER TABLE "public"."gameservers"
  ADD COLUMN "addresses" text[];

ALTER TABLE "public"."gameservers"
  ALTER COLUMN "created_by" SET NOT NULL;

ALTER TABLE "public"."gameservers"
  ADD COLUMN "admininstrator" uuid;

ALTER TABLE "public"."gameservers"
  ADD CONSTRAINT "gameservers_admininstrator_fkey" FOREIGN KEY (admininstrator) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL NOT valid;

ALTER TABLE "public"."gameservers" validate CONSTRAINT "gameservers_admininstrator_fkey";

