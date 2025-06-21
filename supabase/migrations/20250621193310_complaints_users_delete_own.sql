-- Allow users to delete their own complaints or authorized roles to delete any complaints
-- Drop the existing restrictive delete policy
DROP POLICY IF EXISTS "Allow authorized roles to DELETE complaints" ON "public"."complaints";

-- Create new policy that allows users to delete their own complaints OR authorized roles to delete any
CREATE POLICY "Users can delete own complaints or authorized roles can delete any" ON "public"."complaints"
  FOR DELETE TO authenticated
    USING (public.is_owner(created_by)
      OR public.has_permission('complaints.delete'::public.app_permission));

