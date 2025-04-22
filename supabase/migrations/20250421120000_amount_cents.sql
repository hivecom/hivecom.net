ALTER TABLE "public"."expenses"
  DROP COLUMN "amount";

ALTER TABLE "public"."expenses"
  ADD COLUMN "amount_cents" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."monthly_funding"
  DROP COLUMN "donation_amount";

ALTER TABLE "public"."monthly_funding"
  DROP COLUMN "donation_lifetime";

ALTER TABLE "public"."monthly_funding"
  DROP COLUMN "patreon_amount";

ALTER TABLE "public"."monthly_funding"
  DROP COLUMN "patreon_lifetime";

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "donation_lifetime_amount_cents" bigint NOT NULL DEFAULT '0'::bigint;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "donation_month_amount_cents" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "patreon_lifetime_amount_cents" bigint NOT NULL DEFAULT '0'::bigint;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "patreon_month_amount_cents" integer NOT NULL DEFAULT 0;

