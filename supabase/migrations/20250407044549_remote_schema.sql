REVOKE DELETE ON TABLE "public"."user_roles" FROM "anon";

REVOKE INSERT ON TABLE "public"."user_roles" FROM "anon";

REVOKE REFERENCES ON TABLE "public"."user_roles" FROM "anon";

REVOKE SELECT ON TABLE "public"."user_roles" FROM "anon";

REVOKE TRIGGER ON TABLE "public"."user_roles" FROM "anon";

REVOKE TRUNCATE ON TABLE "public"."user_roles" FROM "anon";

REVOKE UPDATE ON TABLE "public"."user_roles" FROM "anon";

REVOKE DELETE ON TABLE "public"."user_roles" FROM "authenticated";

REVOKE INSERT ON TABLE "public"."user_roles" FROM "authenticated";

REVOKE REFERENCES ON TABLE "public"."user_roles" FROM "authenticated";

REVOKE SELECT ON TABLE "public"."user_roles" FROM "authenticated";

REVOKE TRIGGER ON TABLE "public"."user_roles" FROM "authenticated";

REVOKE TRUNCATE ON TABLE "public"."user_roles" FROM "authenticated";

REVOKE UPDATE ON TABLE "public"."user_roles" FROM "authenticated";

SET check_function_bodies = OFF;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  INSERT INTO public.profiles(id)
    VALUES(NEW.id);
  RETURN new;
END;
$$;

