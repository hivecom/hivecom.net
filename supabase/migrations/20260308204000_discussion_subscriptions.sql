-- Create discussion_subscriptions table
--
-- Allows users to subscribe to discussions and receive notifications when
-- new replies are posted since their last visit. Each subscription ties a
-- user to a discussion and tracks the last time they viewed it.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.discussion_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The subscribed user (FK to auth.users so subscriptions survive profile
  -- deletion and remain consistent with notifications)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,

  -- The discussion being subscribed to (cascade delete — if the discussion
  -- goes away, subscriptions are meaningless)
  discussion_id uuid NOT NULL REFERENCES public.discussions(id) ON DELETE CASCADE,

  -- Timestamp of the user's last visit to this discussion. Used to determine
  -- whether there are "new" replies since the user last checked.
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL DEFAULT auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- A user can only subscribe to a given discussion once
CREATE UNIQUE INDEX discussion_subscriptions_user_discussion_idx
  ON public.discussion_subscriptions (user_id, discussion_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Look up all subscriptions for a user (e.g. "my subscriptions" page)
CREATE INDEX discussion_subscriptions_user_id_idx
  ON public.discussion_subscriptions (user_id);

-- Look up all subscribers for a discussion (e.g. to fan-out notifications)
CREATE INDEX discussion_subscriptions_discussion_id_idx
  ON public.discussion_subscriptions (discussion_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.discussion_subscriptions
  IS 'User subscriptions to discussions. Tracks whether there are new replies since the user last visited.';
COMMENT ON COLUMN public.discussion_subscriptions.user_id
  IS 'The auth.users subscriber.';
COMMENT ON COLUMN public.discussion_subscriptions.discussion_id
  IS 'The discussion being subscribed to.';
COMMENT ON COLUMN public.discussion_subscriptions.last_seen_at
  IS 'Timestamp of the subscriber''s last visit to this discussion. Replies created after this are considered new.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.discussion_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own subscriptions
CREATE POLICY "Users can read own subscriptions"
  ON public.discussion_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can subscribe themselves
CREATE POLICY "Users can insert own subscriptions"
  ON public.discussion_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions (e.g. bump last_seen_at)
CREATE POLICY "Users can update own subscriptions"
  ON public.discussion_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can unsubscribe (delete their own subscriptions)
CREATE POLICY "Users can delete own subscriptions"
  ON public.discussion_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role needs full access for trigger-based fan-out
-- (e.g. looking up all subscribers for a discussion to create notifications)

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_subscriptions TO authenticated;
GRANT SELECT ON public.discussion_subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_subscriptions TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Audit trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER update_discussion_subscriptions_audit_fields
  BEFORE UPDATE ON public.discussion_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Auto-subscribe discussion authors
--    When a discussion is created, automatically subscribe the author.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_subscribe_discussion_author()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.discussion_subscriptions (user_id, discussion_id)
  VALUES (NEW.created_by, NEW.id)
  ON CONFLICT (user_id, discussion_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_subscribe_discussion_author_trigger
  AFTER INSERT ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_subscribe_discussion_author();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Auto-subscribe reply authors
--    When a user posts a reply to a discussion they are not yet subscribed to,
--    automatically subscribe them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_subscribe_reply_author()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.discussion_subscriptions (user_id, discussion_id, last_seen_at)
  VALUES (NEW.created_by, NEW.discussion_id, now())
  ON CONFLICT (user_id, discussion_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_subscribe_reply_author_trigger
  AFTER INSERT ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_subscribe_reply_author();

COMMIT;
