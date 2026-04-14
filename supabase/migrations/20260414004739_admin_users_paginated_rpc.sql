-- Migration: admin_users_paginated_rpc
-- Replaces three separate client-side queries (profiles, user_roles,
-- get_admin_user_overview) with a single paginated, filterable, sortable RPC.

CREATE OR REPLACE FUNCTION public.get_admin_users_paginated(
  p_search    text    DEFAULT '',
  p_role      text    DEFAULT '',
  p_status    text    DEFAULT '',
  p_sort_col  text    DEFAULT 'created_at',
  p_sort_dir  text    DEFAULT 'desc',
  p_limit     integer DEFAULT 10,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE(
  user_id              uuid,
  username             text,
  country              character varying,
  birthday             date,
  created_at           timestamp with time zone,
  modified_at          timestamp with time zone,
  modified_by          uuid,
  supporter_lifetime   boolean,
  supporter_patreon    boolean,
  badges               profile_badge[],
  patreon_id           text,
  steam_id             text,
  discord_id           text,
  introduction         text,
  markdown             text,
  banned               boolean,
  ban_reason           text,
  ban_start            timestamp with time zone,
  ban_end              timestamp with time zone,
  last_seen            timestamp with time zone,
  website              text,
  public               boolean,
  role                 text,
  email                text,
  is_confirmed         boolean,
  discord_display_name text,
  auth_provider        text,
  auth_providers       text[],
  platform_count       integer,
  is_supporter         boolean,
  is_banned            boolean,
  role_sort            integer,
  total_count          bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  has_access    boolean;
  is_admin_user boolean;
BEGIN
  has_access := public.has_permission('users.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin user overview';
  END IF;

  is_admin_user := public.has_permission('roles.update'::public.app_permission);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id                                                          AS user_id,
      p.username,
      p.country,
      p.birthday,
      p.created_at,
      p.modified_at,
      p.modified_by,
      p.supporter_lifetime,
      p.supporter_patreon,
      p.badges,
      p.patreon_id,
      p.steam_id,
      p.discord_id,
      p.introduction,
      p.markdown,
      p.banned,
      p.ban_reason,
      p.ban_start,
      p.ban_end,
      p.last_seen,
      p.website,
      p.public,
      -- role from user_roles (null = regular user)
      ur.role::text                                                 AS role,
      -- email only for callers with roles.update permission
      CASE
        WHEN is_admin_user THEN u.email::text
        ELSE NULL::text
      END                                                           AS email,
      -- confirmed: social auth or verified email/phone
      (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb)
          ) AS p2(provider)
          WHERE p2.provider <> 'email'
        )
        OR u.email_confirmed_at IS NOT NULL
        OR u.phone_confirmed_at IS NOT NULL
      )                                                             AS is_confirmed,
      -- discord display name from identity_data (try several field names)
      COALESCE(
        NULLIF(i.identity_data->>'global_name',       ''),
        NULLIF(i.identity_data->>'username',           ''),
        NULLIF(i.identity_data->>'user_name',          ''),
        NULLIF(i.identity_data->>'display_name',       ''),
        NULLIF(i.identity_data->>'name',               ''),
        NULLIF(i.identity_data->>'preferred_username', '')
      )::text                                                       AS discord_display_name,
      (u.raw_app_meta_data->>'provider')::text                     AS auth_provider,
      (
        SELECT COALESCE(
          array_agg(DISTINCT p3.provider ORDER BY p3.provider),
          ARRAY[]::text[]
        )
        FROM jsonb_array_elements_text(
          COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb)
        ) AS p3(provider)
      )                                                             AS auth_providers,
      -- derived counts / flags
      (
        (CASE WHEN p.steam_id   IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p.discord_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p.patreon_id IS NOT NULL THEN 1 ELSE 0 END)
      )                                                             AS platform_count,
      (COALESCE(p.supporter_lifetime, false) OR COALESCE(p.supporter_patreon, false))
                                                                    AS is_supporter,
      (
        COALESCE(p.banned, false)
        AND (p.ban_end IS NULL OR p.ban_end > now())
      )                                                             AS is_banned,
      CASE ur.role::text
        WHEN 'admin'     THEN 2
        WHEN 'moderator' THEN 1
        ELSE 0
      END                                                           AS role_sort
    FROM public.profiles    AS p
    JOIN auth.users          AS u  ON u.id       = p.id
    LEFT JOIN public.user_roles  AS ur ON ur.user_id  = p.id
    LEFT JOIN auth.identities    AS i
      ON  i.user_id  = u.id
      AND i.provider = 'discord'
    WHERE
      -- search: username, uuid, and (admin-only) email
      (
        p_search = ''
        OR p.username ILIKE '%' || p_search || '%'
        OR p.id::text ILIKE '%' || p_search || '%'
        OR (is_admin_user AND u.email ILIKE '%' || p_search || '%')
      )
      -- role filter: 'user' means no role row
      AND (
        p_role = ''
        OR (p_role = 'user'      AND ur.role IS NULL)
        OR (p_role = 'admin'     AND ur.role::text = 'admin')
        OR (p_role = 'moderator' AND ur.role::text = 'moderator')
      )
      -- status filter
      AND (
        p_status = ''
        OR (
          p_status = 'banned'
          AND COALESCE(p.banned, false)
          AND (p.ban_end IS NULL OR p.ban_end > now())
        )
        OR (
          p_status = 'active'
          AND NOT (COALESCE(p.banned, false) AND (p.ban_end IS NULL OR p.ban_end > now()))
        )
      )
  )
  SELECT
    b.user_id,
    b.username,
    b.country,
    b.birthday,
    b.created_at,
    b.modified_at,
    b.modified_by,
    b.supporter_lifetime,
    b.supporter_patreon,
    b.badges,
    b.patreon_id,
    b.steam_id,
    b.discord_id,
    b.introduction,
    b.markdown,
    b.banned,
    b.ban_reason,
    b.ban_start,
    b.ban_end,
    b.last_seen,
    b.website,
    b.public,
    b.role,
    b.email,
    b.is_confirmed,
    b.discord_display_name,
    b.auth_provider,
    b.auth_providers,
    b.platform_count,
    b.is_supporter,
    b.is_banned,
    b.role_sort,
    COUNT(*) OVER ()                                                AS total_count
  FROM base AS b
  ORDER BY
    -- ASC branch (text columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'username'   THEN b.username
        WHEN 'last_seen'  THEN b.last_seen::text
        WHEN 'created_at' THEN b.created_at::text
        ELSE b.created_at::text
      END
    END ASC NULLS LAST,
    -- ASC branch (integer columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'role'      THEN b.role_sort
        WHEN 'platforms' THEN b.platform_count
        ELSE NULL::int
      END
    END ASC NULLS LAST,
    -- ASC branch (boolean columns)
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'status'    THEN b.is_banned
        WHEN 'supporter' THEN b.is_supporter
        WHEN 'confirmed' THEN b.is_confirmed
        ELSE NULL::boolean
      END
    END ASC NULLS LAST,
    -- DESC branch (text columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'username'   THEN b.username
        WHEN 'last_seen'  THEN b.last_seen::text
        WHEN 'created_at' THEN b.created_at::text
        ELSE b.created_at::text
      END
    END DESC NULLS LAST,
    -- DESC branch (integer columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'role'      THEN b.role_sort
        WHEN 'platforms' THEN b.platform_count
        ELSE NULL::int
      END
    END DESC NULLS LAST,
    -- DESC branch (boolean columns)
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'status'    THEN b.is_banned
        WHEN 'supporter' THEN b.is_supporter
        WHEN 'confirmed' THEN b.is_confirmed
        ELSE NULL::boolean
      END
    END DESC NULLS LAST,
    -- stable tiebreaker
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;
