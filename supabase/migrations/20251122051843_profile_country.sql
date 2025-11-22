ALTER TABLE "public"."profiles"
	ADD COLUMN "country" character varying(2);

ALTER TABLE "public"."profiles"
	ADD CONSTRAINT profiles_country_check
	CHECK ((country IS NULL) OR (country ~ '^[A-Z]{2}$'));
