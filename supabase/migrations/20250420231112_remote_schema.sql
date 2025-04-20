ALTER TABLE "public"."monthly_funding"
  DROP COLUMN "donation";

ALTER TABLE "public"."monthly_funding"
  DROP COLUMN "patreon";

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "donation_amount" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "donation_lifetime" bigint NOT NULL DEFAULT '0'::bigint;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "patreon_amount" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "patreon_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."monthly_funding"
  ADD COLUMN "patreon_lifetime" bigint NOT NULL DEFAULT '0'::bigint;

SET check_function_bodies = OFF;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  bind_permissions int;
  user_role public.app_role;
BEGIN
  -- Fetch user role once and store it to reduce number of calls
  SELECT
    (auth.jwt() ->> 'user_role')::public.app_role INTO user_role;
  SELECT
    COUNT(*) INTO bind_permissions
  FROM
    public.role_permissions
  WHERE
    role_permissions.permission = requested_permission
    AND role_permissions.role = user_role;
  RETURN bind_permissions > 0;
END;
$function$;

