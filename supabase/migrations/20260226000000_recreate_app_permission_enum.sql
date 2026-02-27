-- Recreate app_permission enum and clean legacy forum/announcement/manage policies

BEGIN;

-- Remove legacy permissions that will no longer exist
DELETE FROM public.role_permissions
WHERE permission::text IN (
  'announcements.create',
  'announcements.delete',
  'announcements.read',
  'announcements.update',
  'forums.create',
  'forums.delete',
  'forums.read',
  'forums.update',
  'discussions.manage'
);

-- Recreate enum type without legacy values
ALTER TYPE public.app_permission RENAME TO app_permission__old_version_to_be_dropped;

CREATE TYPE public.app_permission AS ENUM(
  'assets.create',
  'assets.delete',
  'assets.read',
  'assets.update',
  'complaints.create',
  'complaints.delete',
  'complaints.read',
  'complaints.update',
  'containers.create',
  'containers.delete',
  'containers.read',
  'containers.update',
  'discussion_topics.create',
  'discussion_topics.read',
  'discussion_topics.update',
  'discussion_topics.delete',
  'discussions.create',
  'discussions.read',
  'discussions.update',
  'discussions.delete',
  'events.create',
  'events.delete',
  'events.read',
  'events.update',
  'expenses.create',
  'expenses.delete',
  'expenses.read',
  'expenses.update',
  'funding.create',
  'funding.delete',
  'funding.read',
  'funding.update',
  'games.create',
  'games.delete',
  'games.read',
  'games.update',
  'gameservers.create',
  'gameservers.delete',
  'gameservers.read',
  'gameservers.update',
  'kvstore.create',
  'kvstore.read',
  'kvstore.update',
  'kvstore.delete',
  'motds.create',
  'motds.read',
  'motds.update',
  'motds.delete',
  'profiles.delete',
  'profiles.read',
  'profiles.update',
  'projects.create',
  'projects.read',
  'projects.update',
  'projects.delete',
  'referendums.create',
  'referendums.delete',
  'referendums.read',
  'referendums.update',
  'roles.create',
  'roles.delete',
  'roles.read',
  'roles.update',
  'servers.create',
  'servers.delete',
  'servers.read',
  'servers.update',
  'users.create',
  'users.delete',
  'users.read',
  'users.update'
);

ALTER TABLE public.role_permissions
  ALTER COLUMN permission TYPE public.app_permission
  USING permission::text::public.app_permission;

-- Ensure authorize helpers are bound to the new enum
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
  SELECT (auth.jwt() ->> 'user_role')::public.app_role INTO user_role;

  SELECT COUNT(*) INTO bind_permissions
  FROM public.role_permissions
  WHERE role_permissions.permission = requested_permission
    AND role_permissions.role = user_role;

  RETURN bind_permissions > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(permission_name app_permission)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  SELECT public.authorize(permission_name);
$function$;

-- Drop policies that referenced legacy permissions (forums/announcements/manage)
DROP POLICY IF EXISTS "Admins can manage discussion topics" ON public.discussion_topics;
DROP POLICY IF EXISTS "Forum users can create discussion topics" ON public.discussion_topics;
DROP POLICY IF EXISTS "Forum users can update discussion topics" ON public.discussion_topics;
DROP POLICY IF EXISTS "Forum users can delete discussion topics" ON public.discussion_topics;

-- Recreate discussion_topics policies using discussion_topics.* permissions
DROP POLICY IF EXISTS "Users can create discussion topics" ON public.discussion_topics;
DROP POLICY IF EXISTS "Users can update discussion topics" ON public.discussion_topics;
DROP POLICY IF EXISTS "Users can delete discussion topics" ON public.discussion_topics;

CREATE POLICY "Users can create discussion topics"
  ON public.discussion_topics FOR INSERT
  TO authenticated
  WITH CHECK (
    authorize('discussion_topics.create'::public.app_permission)
  );

CREATE POLICY "Users can update discussion topics"
  ON public.discussion_topics FOR UPDATE
  TO authenticated
  USING (
    authorize('discussion_topics.update'::public.app_permission)
  )
  WITH CHECK (
    authorize('discussion_topics.update'::public.app_permission)
  );

CREATE POLICY "Users can delete discussion topics"
  ON public.discussion_topics FOR DELETE
  TO authenticated
  USING (
    authorize('discussion_topics.delete'::public.app_permission)
  );

-- Update discussion policies to remove discussions.manage
DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;
CREATE POLICY "Everyone can view discussions"
  ON public.discussions FOR SELECT
  USING (
    is_draft = false
    OR auth.uid() = created_by
    OR authorize('discussions.update'::public.app_permission)
  );

DROP POLICY IF EXISTS "Everyone can view replies" ON public.discussion_replies;
CREATE POLICY "Everyone can view replies"
  ON public.discussion_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.discussions d
      WHERE d.id = discussion_id
        AND (
          d.is_draft = false
          OR auth.uid() = d.created_by
          OR authorize('discussions.update'::public.app_permission)
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create discussions" ON public.discussions;
CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    (
      (
        discussion_topic_id IS NOT NULL AND
        event_id IS NULL AND
        referendum_id IS NULL AND
        project_id IS NULL AND
        gameserver_id IS NULL AND
        EXISTS (
          SELECT 1 FROM public.discussion_topics dt
          WHERE dt.id = discussion_topic_id
            AND (dt.is_locked = false OR authorize('discussions.update'::public.app_permission))
        )
      )
      OR
      (
        num_nonnulls(event_id, referendum_id, profile_id, project_id, gameserver_id) > 0
      )
    )
  );

-- Update admin field protection to use discussions.update
CREATE OR REPLACE FUNCTION public.protect_discussion_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.is_locked IS DISTINCT FROM NEW.is_locked) OR (OLD.is_sticky IS DISTINCT FROM NEW.is_sticky) THEN
    IF NOT authorize('discussions.update'::public.app_permission) THEN
       RAISE EXCEPTION 'Insufficient permissions to modify lock/sticky status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rebind policies that referenced the old app_permission enum
DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_policy" ON public.projects;

CREATE POLICY "projects_insert_policy" ON public.projects AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (authorize('projects.create'::public.app_permission));

CREATE POLICY "projects_update_policy" ON public.projects AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (authorize('projects.update'::public.app_permission))
  WITH CHECK (authorize('projects.update'::public.app_permission)
    AND audit_fields_unchanged(created_at, created_by));

CREATE POLICY "projects_delete_policy" ON public.projects AS PERMISSIVE
  FOR DELETE TO authenticated
  USING (authorize('projects.delete'::public.app_permission));

DROP POLICY IF EXISTS "Moderators can update any discussion" ON public.discussions;
CREATE POLICY "Moderators can update any discussion"
  ON public.discussions FOR UPDATE
  TO authenticated
  USING (authorize('discussions.update'::public.app_permission));

DROP POLICY IF EXISTS "Moderators can delete any discussion" ON public.discussions;
CREATE POLICY "Moderators can delete any discussion"
  ON public.discussions FOR DELETE
  TO authenticated
  USING (authorize('discussions.delete'::public.app_permission));

DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;
CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_id
        AND d.is_draft = false
        AND (d.is_locked = false OR authorize('discussions.update'::public.app_permission))
    )
  );

DROP POLICY IF EXISTS "Moderators can update any reply" ON public.discussion_replies;
CREATE POLICY "Moderators can update any reply"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (authorize('discussions.update'::public.app_permission));

DROP POLICY IF EXISTS "Moderators can delete any reply" ON public.discussion_replies;
CREATE POLICY "Moderators can delete any reply"
  ON public.discussion_replies FOR DELETE
  TO authenticated
  USING (authorize('discussions.delete'::public.app_permission));

DROP POLICY IF EXISTS "Allow authenticated updates in forums staging directory" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes in forums staging directory" ON storage.objects;
CREATE POLICY "Allow authenticated deletes in forums staging directory"
  ON storage.objects
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussions.delete'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
  );

-- Rebind policies that used has_permission(old_enum) via a dynamic rebind
DO $$
DECLARE
  p record;
  policy_roles text;
  policy_qual text;
  policy_with_check text;
  legacy_found boolean;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, roles, permissive, cmd, pg_policies.qual, pg_policies.with_check
    FROM pg_policies
    WHERE (pg_policies.qual LIKE '%app_permission__old_version_to_be_dropped%'
       OR pg_policies.with_check LIKE '%app_permission__old_version_to_be_dropped%')
  LOOP
    policy_roles := CASE
      WHEN p.roles IS NULL OR array_length(p.roles, 1) = 0 THEN 'PUBLIC'
      ELSE array_to_string(ARRAY(SELECT quote_ident(r) FROM unnest(p.roles) r), ', ')
    END;

    legacy_found := (
      coalesce(p.qual, '') LIKE '%announcements.%'
      OR coalesce(p.with_check, '') LIKE '%announcements.%'
      OR coalesce(p.qual, '') LIKE '%forums.%'
      OR coalesce(p.with_check, '') LIKE '%forums.%'
      OR coalesce(p.qual, '') LIKE '%discussions.manage%'
      OR coalesce(p.with_check, '') LIKE '%discussions.manage%'
    );

    IF legacy_found THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      CONTINUE;
    END IF;

    policy_qual := CASE
      WHEN p.qual IS NULL OR p.qual = '' THEN NULL
      ELSE replace(p.qual, 'app_permission__old_version_to_be_dropped', 'app_permission')
    END;

    policy_with_check := CASE
      WHEN p.with_check IS NULL OR p.with_check = '' THEN NULL
      ELSE replace(p.with_check, 'app_permission__old_version_to_be_dropped', 'app_permission')
    END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      p.policyname,
      p.schemaname,
      p.tablename,
      CASE WHEN p.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      p.cmd,
      policy_roles,
      CASE WHEN policy_qual IS NOT NULL THEN format(' USING (%s)', policy_qual) ELSE '' END,
      CASE WHEN policy_with_check IS NOT NULL THEN format(' WITH CHECK (%s)', policy_with_check) ELSE '' END
    );
  END LOOP;
END $$;


-- Drop announcements-related storage policies
DROP POLICY IF EXISTS "Allow authorized roles to INSERT announcement assets in storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE announcement assets in storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow authorized roles to DELETE announcement assets in storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public SELECT announcement assets in storage" ON storage.objects;

-- Drop announcements policies if the table still exists
DO $$
BEGIN
  IF to_regclass('public.announcements') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authorized roles to INSERT announcements" ON public.announcements';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authorized roles to UPDATE announcements" ON public.announcements';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authorized roles to DELETE announcements" ON public.announcements';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authorized roles to SELECT all announcements" ON public.announcements';
    EXECUTE 'DROP POLICY IF EXISTS "Everyone can SELECT published announcements" ON public.announcements';
  END IF;
END $$;

-- Clean up old enum artifacts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_type t ON p.proargtypes[0] = t.oid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'authorize'
      AND t.typname = 'app_permission__old_version_to_be_dropped'
  ) THEN
    DROP FUNCTION IF EXISTS public.authorize(app_permission__old_version_to_be_dropped);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_type t ON p.proargtypes[0] = t.oid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_permission'
      AND t.typname = 'app_permission__old_version_to_be_dropped'
  ) THEN
    DROP FUNCTION IF EXISTS public.has_permission(app_permission__old_version_to_be_dropped);
  END IF;
END $$;

DROP TYPE public.app_permission__old_version_to_be_dropped;

COMMIT;
