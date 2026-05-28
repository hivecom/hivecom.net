-- Restore RLS policies on complaints that were lost when app_permission
-- enum was recreated in 20260226000000_recreate_app_permission_enum.sql.
-- The auto-repair loop in that migration only caught policies that directly
-- referenced the old enum type; these policies used has_permission/is_owner
-- wrappers and so were silently dropped without being recreated.

-- SELECT: users can read their own complaints; admins/mods with complaints.read can read all
CREATE POLICY "Users can read own complaints or authorized roles can read all"
  ON public.complaints FOR SELECT TO authenticated
  USING (
    public.is_owner(created_by)
    OR public.has_permission('complaints.read'::public.app_permission)
  );

-- INSERT: users can submit complaints against themselves; authorized roles can create on behalf of others
CREATE POLICY "Users can create own complaints or authorized roles can create"
  ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner(created_by)
    OR public.has_permission('complaints.create'::public.app_permission)
  );

-- UPDATE: only authorized roles can update complaints (e.g. adding a response)
CREATE POLICY "Allow authorized roles to UPDATE complaints"
  ON public.complaints FOR UPDATE TO authenticated
  USING (public.has_permission('complaints.update'::public.app_permission));

-- DELETE: users can delete their own unresponded complaints; authorized roles can delete any
CREATE POLICY "Users can delete own complaints or authorized roles can delete any"
  ON public.complaints FOR DELETE TO authenticated
  USING (
    public.is_owner(created_by)
    OR public.has_permission('complaints.delete'::public.app_permission)
  );
