-- Fix complaint FK cascades: change ON DELETE CASCADE to ON DELETE SET NULL
--
-- Complaints should never be deleted when their associated entity is removed.
-- The complaint record is the audit trail — losing it because a user deleted
-- their account, a discussion was removed, or a gameserver was decommissioned
-- defeats the purpose.
--
-- This migration changes all context FK columns AND the created_by FK from
-- ON DELETE CASCADE to ON DELETE SET NULL so the complaint row survives but
-- loses the reference to the deleted entity.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. created_by (references auth.users)
--    Currently: ON UPDATE CASCADE ON DELETE CASCADE
--    Target:    ON UPDATE CASCADE ON DELETE SET NULL
--
--    The created_by column is NOT NULL, so we also need to make it nullable
--    first. A complaint from a deleted user should still exist.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.complaints
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.complaints
  DROP CONSTRAINT complaints_created_by_fkey;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. context_user (references auth.users)
--    Currently: ON UPDATE CASCADE ON DELETE CASCADE
--    Target:    ON UPDATE CASCADE ON DELETE SET NULL
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.complaints
  DROP CONSTRAINT complaints_context_user_fkey;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_context_user_fkey
  FOREIGN KEY (context_user)
  REFERENCES auth.users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. context_gameserver (references public.gameservers)
--    Currently: ON UPDATE CASCADE ON DELETE CASCADE
--    Target:    ON UPDATE CASCADE ON DELETE SET NULL
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.complaints
  DROP CONSTRAINT complaints_context_gameserver_fkey;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_context_gameserver_fkey
  FOREIGN KEY (context_gameserver)
  REFERENCES public.gameservers(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. context_discussion (references public.discussions)
--    Currently: ON UPDATE CASCADE ON DELETE CASCADE
--    Target:    ON UPDATE CASCADE ON DELETE SET NULL
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.complaints
  DROP CONSTRAINT complaints_context_discussion_fkey;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_context_discussion_fkey
  FOREIGN KEY (context_discussion)
  REFERENCES public.discussions(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. context_discussion_reply (references public.discussion_replies)
--    Currently: ON UPDATE CASCADE ON DELETE CASCADE
--    Target:    ON UPDATE CASCADE ON DELETE SET NULL
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.complaints
  DROP CONSTRAINT complaints_context_discussion_reply_fkey;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_context_discussion_reply_fkey
  FOREIGN KEY (context_discussion_reply)
  REFERENCES public.discussion_replies(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

COMMIT;
