-- =============================================================================
-- drop_legacy_profile_badge_column
-- =============================================================================
-- Step 4 of the badge system redesign:
--   1. Recreate the profiles UPDATE RLS policy without the
--      `badges IS NOT DISTINCT FROM badges` guard.
--   2. Recreate get_admin_users_paginated without the badges profile_badge[]
--      return column (all badge data now lives in profile_badges table).
--   3. Drop profiles.badges column.
--   4. Drop profile_badge enum.
--
-- Prerequisites: all reads have been migrated to profile_badges (steps 1-3
-- completed). The column is kept write-locked by RLS after step 1 but is no
-- longer selected anywhere.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Recreate profiles UPDATE policy without badges guard
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
            AND tablename  = 'profiles'
            AND policyname = 'Allow authorized roles to UPDATE profiles'
    ) THEN
        DROP POLICY "Allow authorized roles to UPDATE profiles" ON public.profiles;
    END IF;
END
$$;

CREATE POLICY "Allow authorized roles to UPDATE profiles" ON public.profiles
    AS PERMISSIVE FOR UPDATE TO authenticated
    USING (
        public.has_permission('profiles.update'::public.app_permission)
        OR public.is_profile_owner(id)
    )
    WITH CHECK (
        (
            public.has_permission('profiles.update'::public.app_permission)
            OR public.is_profile_owner(id)
        )
        AND (
            public.has_permission('users.update'::public.app_permission)
            OR (
                public.is_profile_owner(id)
                AND created_at      IS NOT DISTINCT FROM created_at
                AND modified_at     IS NOT DISTINCT FROM modified_at
                AND modified_by     IS NOT DISTINCT FROM modified_by
                AND discord_id      IS NOT DISTINCT FROM discord_id
                AND patreon_id      IS NOT DISTINCT FROM patreon_id
                AND steam_id        IS NOT DISTINCT FROM steam_id
                AND supporter_patreon   IS NOT DISTINCT FROM supporter_patreon
                AND supporter_lifetime  IS NOT DISTINCT FROM supporter_lifetime
                AND banned          IS NOT DISTINCT FROM banned
                AND ban_reason      IS NOT DISTINCT FROM ban_reason
                AND ban_start       IS NOT DISTINCT FROM ban_start
                AND ban_end         IS NOT DISTINCT FROM ban_end
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 2. Recreate get_admin_users_paginated without badges column
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_admin_users_paginated(text, text, text, text, text, text, text, text, text, integer, integer);

CREATE FUNCTION public.get_admin_users_paginated(
    p_search    text    DEFAULT '',
    p_role      text    DEFAULT '',
    p_status    text    DEFAULT '',
    p_provider  text    DEFAULT '',
    p_platform  text    DEFAULT '',
    p_supporter text    DEFAULT '',
    p_country   text    DEFAULT '',
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
    rich_presence_enabled boolean,
    has_teamspeak        boolean,
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
    v_sort_expr   text;
    v_sql         text;
BEGIN
    has_access := public.has_permission('users.read'::public.app_permission);

    IF NOT has_access THEN
        RAISE EXCEPTION 'Insufficient permissions to view admin user overview';
    END IF;

    is_admin_user := public.has_permission('roles.update'::public.app_permission);

    v_sort_expr := CASE p_sort_col
        WHEN 'username'   THEN 'b.username'
        WHEN 'last_seen'  THEN 'b.last_seen'
        WHEN 'created_at' THEN 'b.created_at'
        WHEN 'role'       THEN 'b.role_sort'
        WHEN 'platforms'  THEN 'b.platform_count'
        WHEN 'status'     THEN 'b.is_banned'
        WHEN 'supporter'  THEN 'b.is_supporter'
        WHEN 'confirmed'  THEN 'b.is_confirmed'
        ELSE 'b.created_at'
    END;

    v_sql := $q$
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
                p.rich_presence_enabled,
                (
                    p.teamspeak_identities IS NOT NULL
                    AND jsonb_array_length(p.teamspeak_identities) > 0
                )                                                             AS has_teamspeak,
                ur.role::text                                                 AS role,
                CASE
                    WHEN $9 THEN u.email::text
                    ELSE NULL::text
                END                                                           AS email,
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
                (
                    $1 = ''
                    OR p.username ILIKE '%' || $1 || '%'
                    OR p.id::text ILIKE '%' || $1 || '%'
                    OR ($9 AND u.email ILIKE '%' || $1 || '%')
                )
                AND (
                    $2 = ''
                    OR ($2 = 'user'      AND ur.role IS NULL)
                    OR ($2 = 'admin'     AND ur.role::text = 'admin')
                    OR ($2 = 'moderator' AND ur.role::text = 'moderator')
                )
                AND (
                    $3 = ''
                    OR (
                        $3 = 'banned'
                        AND COALESCE(p.banned, false)
                        AND (p.ban_end IS NULL OR p.ban_end > now())
                    )
                    OR (
                        $3 = 'active'
                        AND NOT (COALESCE(p.banned, false) AND (p.ban_end IS NULL OR p.ban_end > now()))
                    )
                )
                AND (
                    $4 = ''
                    OR u.raw_app_meta_data->'providers' @> to_jsonb($4::text)
                )
                AND (
                    $5 = ''
                    OR ($5 = 'steam'     AND p.steam_id IS NOT NULL)
                    OR ($5 = 'discord'   AND p.discord_id IS NOT NULL)
                    OR ($5 = 'patreon'   AND p.patreon_id IS NOT NULL)
                    OR ($5 = 'teamspeak' AND p.teamspeak_identities IS NOT NULL AND jsonb_array_length(p.teamspeak_identities) > 0)
                )
                AND (
                    $6 = ''
                    OR ($6 = 'true'  AND (COALESCE(p.supporter_lifetime, false) OR COALESCE(p.supporter_patreon, false)))
                    OR ($6 = 'false' AND NOT (COALESCE(p.supporter_lifetime, false) OR COALESCE(p.supporter_patreon, false)))
                )
                AND (
                    $7 = ''
                    OR p.country = $7
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
            b.rich_presence_enabled,
            b.has_teamspeak,
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
            COUNT(*) OVER () AS total_count
        FROM base AS b
        ORDER BY $q$ || v_sort_expr || ' ' || p_sort_dir || $q$ NULLS LAST, b.created_at DESC
        LIMIT  $10
        OFFSET $11
    $q$;

    RETURN QUERY EXECUTE v_sql
        USING
            p_search,      -- $1
            p_role,        -- $2
            p_status,      -- $3
            p_provider,    -- $4
            p_platform,    -- $5
            p_supporter,   -- $6
            p_country,     -- $7
            p_sort_col,    -- $8 (positional alignment placeholder)
            is_admin_user, -- $9
            p_limit,       -- $10
            p_offset;      -- $11
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Drop profiles.badges column
-- ---------------------------------------------------------------------------

-- The self-edit policy "Users can UPDATE their information on their profiles"
-- also references badges - must be recreated before dropping the column.
DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;
CREATE POLICY "Users can UPDATE their information on their profiles"
    ON public.profiles
    FOR UPDATE
    USING (
        (SELECT auth.uid()) = id
        AND public.is_not_banned()
        AND public.is_aal2_if_mfa()
    )
    WITH CHECK (
        ((SELECT auth.uid()) = id)
        AND public.is_not_banned()
        AND public.is_aal2_if_mfa()
        AND (NOT (created_at              IS DISTINCT FROM created_at))
        AND (NOT (discord_id              IS DISTINCT FROM discord_id))
        AND (NOT (patreon_id              IS DISTINCT FROM patreon_id))
        AND (NOT (supporter_patreon       IS DISTINCT FROM supporter_patreon))
        AND (NOT (supporter_lifetime      IS DISTINCT FROM supporter_lifetime))
        AND (NOT (steam_id               IS DISTINCT FROM steam_id))
        AND (NOT (teamspeak_identities    IS DISTINCT FROM teamspeak_identities))
        AND (NOT (has_banner              IS DISTINCT FROM has_banner))
        AND (NOT (banner_extension        IS DISTINCT FROM banner_extension))
    );

ALTER TABLE public.profiles DROP COLUMN IF EXISTS badges;

-- ---------------------------------------------------------------------------
-- 4. Drop profile_badge enum
-- ---------------------------------------------------------------------------

DROP TYPE IF EXISTS public.profile_badge;
