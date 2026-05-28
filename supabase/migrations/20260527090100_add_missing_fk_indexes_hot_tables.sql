-- Add missing indexes for unindexed foreign keys on high-traffic tables.
-- These columns are frequently used in JOINs and WHERE clauses.

-- discussion_replies
CREATE INDEX IF NOT EXISTS idx_discussion_replies_created_by
  ON public.discussion_replies (created_by);

CREATE INDEX IF NOT EXISTS idx_discussion_replies_modified_by
  ON public.discussion_replies (modified_by);

-- discussions
CREATE INDEX IF NOT EXISTS idx_discussions_created_by
  ON public.discussions (created_by);

CREATE INDEX IF NOT EXISTS idx_discussions_modified_by
  ON public.discussions (modified_by);

CREATE INDEX IF NOT EXISTS idx_discussions_last_activity_by
  ON public.discussions (last_activity_by);

-- discussion_topics
CREATE INDEX IF NOT EXISTS idx_discussion_topics_created_by
  ON public.discussion_topics (created_by);

CREATE INDEX IF NOT EXISTS idx_discussion_topics_modified_by
  ON public.discussion_topics (modified_by);

CREATE INDEX IF NOT EXISTS idx_discussion_topics_last_activity_by
  ON public.discussion_topics (last_activity_by);

-- user_notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_by
  ON public.user_notifications (created_by);

CREATE INDEX IF NOT EXISTS idx_user_notifications_modified_by
  ON public.user_notifications (modified_by);

-- profile_point_history
CREATE INDEX IF NOT EXISTS idx_profile_point_history_profile_id
  ON public.profile_point_history (profile_id);

-- events
CREATE INDEX IF NOT EXISTS idx_events_recurrence_parent_id
  ON public.events (recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;
