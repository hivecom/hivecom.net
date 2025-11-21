-- Ensure auth context helpers and policies evaluate auth.*() only once per statement
-- See https://supabase.com/docs/guides/database/postgres/row-level-security#performance

-- Rework authorize helper to cache auth.uid() for each statement
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
	current_user_id uuid;
BEGIN
	-- Evaluate auth.uid() through a sub-select so it runs only once per statement
	current_user_id := (SELECT auth.uid());
	IF current_user_id IS NULL THEN
		RETURN FALSE;
	END IF;

	SELECT
		role
	INTO user_role
	FROM
		public.user_roles
	WHERE
		user_id = current_user_id
	LIMIT 1;

	IF user_role IS NULL THEN
		RETURN FALSE;
	END IF;

	SELECT
		COUNT(*)
	INTO bind_permissions
	FROM
		public.role_permissions
	WHERE
		role_permissions.permission = requested_permission
		AND role_permissions.role = user_role;

	RETURN bind_permissions > 0;
END;
$function$;

-- Helper used by multiple policies that compare user-owned records
CREATE OR REPLACE FUNCTION public.is_owner(record_user_id uuid)
	RETURNS boolean
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path TO ''
	AS $function$
	SELECT
		(SELECT auth.uid()) = record_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.is_profile_owner(profile_id uuid)
	RETURNS boolean
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path TO ''
	AS $function$
	SELECT
		(SELECT auth.uid()) = profile_id;
$function$;

-- Refresh policies that referenced auth.uid() directly so they leverage the cached sub-select pattern

DROP POLICY IF EXISTS "Allow authorized roles to INSERT user roles" ON "public"."user_roles";
CREATE POLICY "Allow authorized roles to INSERT user roles" ON "public"."user_roles" AS permissive
	FOR INSERT TO authenticated
		WITH CHECK((public.has_permission('roles.create'::public.app_permission)
			OR public.has_permission('roles.update'::public.app_permission))
			AND (SELECT auth.uid()) != user_id);

DROP POLICY IF EXISTS "Users can manage own RSVPs" ON "public"."events_rsvps";
CREATE POLICY "Users can manage own RSVPs" ON "public"."events_rsvps"
	FOR ALL TO authenticated
		USING (user_id = (SELECT auth.uid()))
		WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can manage own friend relationships" ON "public"."friends";
CREATE POLICY "Users can manage own friend relationships" ON "public"."friends"
	FOR ALL TO authenticated
		USING (friender = (SELECT auth.uid()))
		WITH CHECK (friender = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete friend relationships involving them" ON "public"."friends";
CREATE POLICY "Users can delete friend relationships involving them" ON "public"."friends"
	FOR DELETE TO authenticated
		USING ((friender = (SELECT auth.uid()))
			OR (friend = (SELECT auth.uid())));

-- Remove duplicate GIN indexes on projects.tags (keep idx_projects_tags only)
DROP INDEX IF EXISTS public.projects_tags_idx;

-- Add covering indexes for FK columns that reference auth.users
CREATE INDEX IF NOT EXISTS idx_events_rsvps_created_by ON public.events_rsvps(created_by);
CREATE INDEX IF NOT EXISTS idx_events_rsvps_modified_by ON public.events_rsvps(modified_by);
CREATE INDEX IF NOT EXISTS idx_servers_created_by ON public.servers(created_by);
CREATE INDEX IF NOT EXISTS idx_servers_modified_by ON public.servers(modified_by);
