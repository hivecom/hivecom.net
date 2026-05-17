-- Restore the INSERT policy for discussion_replies that was silently dropped
-- by DROP TYPE ... CASCADE in
-- 20260515164827_consolidate_permissions_step2_migrate_and_cleanup.sql.
--
-- The policy was originally created in:
--   20260401183439_ban_and_aal_rls_enforcement.sql
-- and referenced ::app_permission, causing it to be dropped by the CASCADE.
-- The restore migration (20260515164828) only restored the SELECT policy.

DROP POLICY IF EXISTS "Authenticated users can create replies" ON public.discussion_replies;

CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies
  FOR INSERT
  WITH CHECK (
    (auth.uid() = created_by)
    AND public.is_not_banned()
    AND (EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.agreed_content_rules = true
    ))
    AND (EXISTS (
      SELECT 1 FROM public.discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (d.is_locked = false OR public.authorize('discussions.update'::public.app_permission))
    ))
  );
