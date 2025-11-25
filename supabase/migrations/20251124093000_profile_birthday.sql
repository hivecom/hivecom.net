ALTER TABLE "public"."profiles"
  ADD COLUMN "birthday" date;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT profiles_birthday_check CHECK ((birthday IS NULL) OR (birthday <= CURRENT_DATE));

