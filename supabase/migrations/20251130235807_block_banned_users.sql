-- Enforce bans during authentication by denying JWT issuance for banned users
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
AS $$
declare
  claims jsonb;
  user_role public.app_role;
  profile_banned boolean := false;
  profile_ban_end timestamptz;
  profile_ban_reason text;
  active_ban boolean := false;
  ban_message text;
begin
  -- Fetch application role for the JWT claim
  select role
  into user_role
  from public.user_roles
  where user_id = (event->>'user_id')::uuid;

  -- Retrieve ban information
  select banned, ban_end, ban_reason
  into profile_banned, profile_ban_end, profile_ban_reason
  from public.profiles
  where id = (event->>'user_id')::uuid;

  if coalesce(profile_banned, false) then
    if profile_ban_end is null or profile_ban_end > now() then
      active_ban := true;
      ban_message := coalesce(
        'Account suspended: ' || profile_ban_reason,
        'Account suspended. Please contact support.'
      );
    end if;
  end if;

  if active_ban then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', ban_message
      )
    );
  end if;

  claims := event->'claims';

  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  else
    claims := jsonb_set(claims, '{user_role}', 'null');
  end if;

  event := jsonb_set(event, '{claims}', claims);

  return event;
end;
$$;

-- Ensure the auth service can read profile ban data
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;

-- Prevent banned users from passing RLS authorization checks
CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  bind_permissions int;
  user_role public.app_role;
  current_user_id uuid;
  profile_banned boolean;
  profile_ban_end timestamptz;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    return false;
  end if;

  select banned, ban_end
  into profile_banned, profile_ban_end
  from public.profiles
  where id = current_user_id;

  if coalesce(profile_banned, false) then
    if profile_ban_end is null or profile_ban_end > now() then
      return false;
    end if;
  end if;

  select role
  into user_role
  from public.user_roles
  where user_id = current_user_id
  limit 1;

  if user_role is null then
    return false;
  end if;

  select count(*)
  into bind_permissions
  from public.role_permissions
  where role_permissions.permission = requested_permission
    and role_permissions.role = user_role;

  return bind_permissions > 0;
end;
$function$;
