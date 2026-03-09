-- Create notifications table
--
-- Per-user notifications populated by DB triggers and CRON jobs.
-- Each notification belongs to a single user and can only be read by that user.
-- Notifications are simple text-based; we can extend with FKs to other entities later.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The user this notification belongs to (FK to auth.users, not profiles,
  -- so notifications survive profile deletion)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,

  -- Simple text content — no markdown needed
  title text NOT NULL,
  body text,

  -- Optional link for the notification to navigate to in the UI
  href text,

  -- Read state
  is_read boolean NOT NULL DEFAULT false,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL DEFAULT auth.uid(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL DEFAULT auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary lookup: all notifications for a user, newest first
CREATE INDEX notifications_user_id_created_at_idx
  ON public.notifications (user_id, created_at DESC);

-- Fast count of unread notifications for the badge
CREATE INDEX notifications_user_id_unread_idx
  ON public.notifications (user_id)
  WHERE is_read = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.notifications
  IS 'Per-user notifications. Each row belongs to exactly one user and is only visible to them.';
COMMENT ON COLUMN public.notifications.user_id
  IS 'The auth.users recipient of this notification.';
COMMENT ON COLUMN public.notifications.title
  IS 'Short notification headline.';
COMMENT ON COLUMN public.notifications.body
  IS 'Optional longer description text.';
COMMENT ON COLUMN public.notifications.href
  IS 'Optional in-app link the notification should navigate to.';
COMMENT ON COLUMN public.notifications.is_read
  IS 'Whether the user has acknowledged / read this notification.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only the system (service_role) or triggers should create notifications;
-- but we allow authenticated inserts guarded by user_id = auth.uid() for
-- edge cases where a user might generate their own notification (e.g. test).
CREATE POLICY "System or self can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own notifications (dismiss)
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Audit trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER update_notifications_audit_fields
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

COMMIT;
