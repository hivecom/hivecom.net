-- Add missing indexes on high-traffic filter columns (REFACTOR.md #179-186).
-- None of these columns were covered by the previous index passes
-- (20250610130000_add_foreign_key_indexes.sql, 20251121221931_rls_initialization_plan_optimization.sql).

-- #179: profiles.banned + profiles.ban_end
-- Used in OR predicates on community/index, funding, and admin user table.
-- Composite index lets Postgres use an index scan instead of a sequential scan
-- for the common .or('banned.eq.false,ban_end.lte.<now>') filter pattern.
CREATE INDEX IF NOT EXISTS idx_profiles_ban
  ON public.profiles(banned, ban_end);

-- #180: profiles.supporter_lifetime + profiles.supporter_patreon
-- funding.vue and community/index.vue both query .or('supporter_lifetime.eq.true,supporter_patreon.eq.true').
-- Partial index covering only supporter rows keeps it tiny and makes the scan index-only.
CREATE INDEX IF NOT EXISTS idx_profiles_supporters
  ON public.profiles(created_at ASC)
  WHERE supporter_lifetime = true OR supporter_patreon = true;

-- #181: discussions.is_draft
-- Partial index for the is_draft = true minority (the common filter is is_draft = false / neq true).
-- Composite index covers the join + filter + sort used by the topic tree fetch.
CREATE INDEX IF NOT EXISTS idx_discussions_is_draft
  ON public.discussions(is_draft)
  WHERE is_draft = true;

CREATE INDEX IF NOT EXISTS idx_discussions_topic_draft
  ON public.discussions(discussion_topic_id, is_draft, last_activity_at DESC);

-- #182: discussion_replies.is_deleted
-- forum_discussion_replies view and reply fetches all filter WHERE is_deleted = false.
-- Partial index on non-deleted rows also covers the discussion_id + created_at sort
-- used in the last_activity_at trigger's MAX(r.created_at) subquery.
CREATE INDEX IF NOT EXISTS idx_discussion_replies_not_deleted
  ON public.discussion_replies(discussion_id, created_at DESC)
  WHERE is_deleted = false;

-- #183: notifications - cover the user_id + source + source_id lookup restricted to unread rows.
-- The existing partial index (notifications_user_id_unread_idx) covers the badge count query,
-- but markDiscussionSeen does a triple-column lookup that hits the non-partial unique index
-- and then filters is_read = false as a post-scan step. This covering index removes that step.
CREATE INDEX IF NOT EXISTS idx_notifications_user_source
  ON public.notifications(user_id, source, source_id)
  WHERE is_read = false;

-- #184: expenses.ended_at
-- funding.vue fetches all expenses and filters active ones client-side.
-- Partial index on active (non-ended) expenses + push the filter to the query.
CREATE INDEX IF NOT EXISTS idx_expenses_active
  ON public.expenses(started_at DESC)
  WHERE ended_at IS NULL;

-- #185: events.date
-- events/index.vue and pages/index.vue both ORDER BY date ASC with no index.
CREATE INDEX IF NOT EXISTS idx_events_date
  ON public.events(date ASC);

-- #186: referendums.date_start + date_end
-- Used by the event_rsvp_window_open check function and any active/upcoming listing filters.
CREATE INDEX IF NOT EXISTS idx_referendums_dates
  ON public.referendums(date_start, date_end);
