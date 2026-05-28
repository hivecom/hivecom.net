-- Merge two permissive INSERT policies and two permissive UPDATE policies on events
-- RESTRICTIVE is_official guards (from 20260527090200) remain intact

-- INSERT: merge admin + owner into single permissive policy
DROP POLICY "Admins can INSERT events" ON events;
DROP POLICY "Users can INSERT non-official events" ON events;

CREATE POLICY "Users can INSERT events"
  ON events
  FOR INSERT
  TO public
  WITH CHECK (
    has_permission('events.create'::app_permission)
    OR (
      is_official = false
      AND created_by = (SELECT auth.uid())
      AND is_not_banned()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
      )
    )
  );

-- UPDATE: merge admin + owner into single permissive policy
DROP POLICY "Admins can UPDATE events" ON events;
DROP POLICY "Users can UPDATE their own events" ON events;

CREATE POLICY "Users can UPDATE events"
  ON events
  FOR UPDATE
  TO public
  USING (
    has_permission('events.update'::app_permission)
    OR (created_by = (SELECT auth.uid()) AND is_not_banned())
  )
  WITH CHECK (
    (
      has_permission('events.update'::app_permission)
      AND audit_fields_unchanged(created_at, created_by)
    )
    OR (
      created_by = (SELECT auth.uid())
      AND is_official = false
      AND is_not_banned()
      AND audit_fields_unchanged(created_at, created_by)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.agreed_content_rules = true
      )
    )
  );
