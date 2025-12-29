SET check_function_bodies = OFF;

-- Postgres cannot change a function's declared return type via CREATE OR REPLACE.
-- Drop first, then recreate.
DROP FUNCTION IF EXISTS public.get_admin_user_overview();

CREATE FUNCTION public.get_admin_user_overview()
  RETURNS TABLE(
    user_id uuid,
    email text,
    is_confirmed boolean,
    discord_display_name text,
    auth_provider text,
    auth_providers text[]
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO public, auth
AS $$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('users.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin user overview';
  END IF;

  RETURN QUERY
    SELECT
      u.id::uuid AS user_id,
      u.email::text AS email,
      (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb)) AS p(provider)
          WHERE p.provider <> 'email'
        )
        OR u.email_confirmed_at IS NOT NULL
        OR u.phone_confirmed_at IS NOT NULL
      ) AS is_confirmed,
      COALESCE(
        NULLIF(i.identity_data->>'global_name', ''),
        NULLIF(i.identity_data->>'username', ''),
        NULLIF(i.identity_data->>'user_name', ''),
        NULLIF(i.identity_data->>'display_name', ''),
        NULLIF(i.identity_data->>'name', ''),
        NULLIF(i.identity_data->>'preferred_username', '')
      )::text AS discord_display_name,
      (u.raw_app_meta_data->>'provider')::text AS auth_provider,
      (
        SELECT COALESCE(array_agg(DISTINCT p.provider ORDER BY p.provider), ARRAY[]::text[])
        FROM jsonb_array_elements_text(COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb)) AS p(provider)
      ) AS auth_providers
    FROM auth.users AS u
    LEFT JOIN auth.identities AS i
      ON i.user_id = u.id
      AND i.provider = 'discord';
END;
$$;

COMMENT ON FUNCTION public.get_admin_user_overview()
  IS 'Returns email + confirmed state + discord display name + auth provider(s) for privileged admin tooling.';

GRANT EXECUTE ON FUNCTION public.get_admin_user_overview() TO authenticated;
