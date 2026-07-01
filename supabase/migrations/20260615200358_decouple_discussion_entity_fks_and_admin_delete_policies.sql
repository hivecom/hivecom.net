-- Change entity FK delete rules from CASCADE to SET NULL
-- so that deleting an entity decouples its discussion instead of cascading.
-- This prevents RLS on discussion child tables from silently blocking entity deletes.
ALTER TABLE public.discussions
  DROP CONSTRAINT discussions_referendum_id_fkey,
  ADD CONSTRAINT discussions_referendum_id_fkey
    FOREIGN KEY (referendum_id) REFERENCES public.referendums(id)
    ON DELETE SET NULL;

ALTER TABLE public.discussions
  DROP CONSTRAINT discussions_event_id_fkey,
  ADD CONSTRAINT discussions_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id)
    ON DELETE SET NULL;

ALTER TABLE public.discussions
  DROP CONSTRAINT discussions_project_id_fkey,
  ADD CONSTRAINT discussions_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id)
    ON DELETE SET NULL;

ALTER TABLE public.discussions
  DROP CONSTRAINT discussions_gameserver_id_fkey,
  ADD CONSTRAINT discussions_gameserver_id_fkey
    FOREIGN KEY (gameserver_id) REFERENCES public.network_gameservers(id)
    ON DELETE SET NULL;

-- Add permission-based DELETE policies so admins/mods can clean up orphaned discussions
CREATE POLICY "Authorized users can DELETE discussions"
  ON public.discussions
  FOR DELETE TO authenticated
  USING (
    has_permission('discussions.delete'::app_permission)
    AND is_not_banned()
    AND is_aal2_if_mfa()
  );

CREATE POLICY "Authorized users can DELETE discussion replies"
  ON public.discussion_replies
  FOR DELETE TO authenticated
  USING (
    has_permission('discussions.delete'::app_permission)
    AND is_not_banned()
    AND is_aal2_if_mfa()
  );

CREATE POLICY "Authorized users can DELETE discussion subscriptions"
  ON public.discussion_subscriptions
  FOR DELETE TO authenticated
  USING (
    has_permission('discussions.delete'::app_permission)
    AND is_not_banned()
    AND is_aal2_if_mfa()
  );
