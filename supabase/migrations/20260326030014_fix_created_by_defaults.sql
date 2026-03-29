-- ─────────────────────────────────────────────────────────────────────────────
-- Fix missing DEFAULT auth.uid() on created_by columns
--
-- The standard pattern across this schema is:
--
--   created_by uuid ... DEFAULT auth.uid()
--
-- This means the database always fills in the creator server-side on INSERT,
-- so clients never need to pass the field explicitly. Several tables were
-- created before this convention was established (or missed it), leaving their
-- created_by columns with no default. This migration retroactively applies the
-- default to every affected table.
--
-- Confirmed against the local database via information_schema.columns.
--
-- Affected tables and why they were missed:
--   themes      - user-owned table added in 20260319185601; required callers
--                 to pass created_by explicitly, relying solely on the RLS
--                 WITH CHECK for enforcement rather than a server-side default.
--   events      - original remote schema (20250407044317) predates the convention.
--   events_rsvps - added in 20250622042635 without the default.
--   games       - same origin as events.
--   gameservers - same origin as events.
--   expenses    - added in 20250418010533 without the default.
--   servers     - created_by column added in 20250610011140 without the default.
--   complaints  - added in 20250610023800 without the default.
--
-- Tables that are already correct and need no change (verified):
--   referendums, projects, motds, kvstore, discussion_topics, discussions,
--   discussion_replies, notifications, alerts.
--
-- Not applicable:
--   forum_discussion_replies - this is a view, not a base table.
--   announcements - table has since been dropped.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.themes
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.events
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.events_rsvps
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.games
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.gameservers
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.expenses
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.servers
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.complaints
  ALTER COLUMN created_by SET DEFAULT auth.uid();
