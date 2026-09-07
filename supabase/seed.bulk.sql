-- ─────────────────────────────────────────────────────────────────────────────
-- Bulk seed - volume on top of seed.sql, not a replacement for it.
--
-- seed.sql is fixtures: named rows that each exercise a specific state (the
-- birthday user, the expired event, the gameserver with no query protocol).
-- Those stay hand-written and readable. This file answers a different question:
-- does the forum still hold up at a few thousand rows, and do the RLS policies
-- and pagination behave when a thread has 400 replies instead of two?
--
-- Run it after a reset, never as part of one:
--   npm run seed:bulk
--   npm run seed:bulk -- --users=2000 --discussions=3000 --replies=40000
--
-- Properties worth knowing:
--   - Additive. It only inserts, every row carries a deterministic ID, and every
--     choice is a hash of that row's key rather than a random draw. Re-running is
--     a no-op, and re-running with bigger numbers tops up without duplicating.
--   - Triggers fire normally. Profile discussions, subscriptions, notifications,
--     reply counts, topic aggregates and badges all come out the way production
--     makes them, because they are made the same way.
--   - Generated accounts share the seed password, so you can sign in as any of
--     them. The email is bulk-<n>@hivecom.local.
--
-- Timestamps reuse the activity curve from the metrics block in seed.sql:
-- trough at 3am, peak at 8pm, weekends busier than weekdays. Forum rows and the
-- dashboard charts agree because the same function shapes both.
--
-- On runtime: replies dominate, and the triggers dominate replies. Inserting 2000
-- replies into one thread takes about 2.7s with everything on, 1.8s with the
-- reply_count trigger off, and 0.4s with reply_count, last_activity and the two
-- badge syncs off. Every reply is at least two UPDATEs on the parent discussion
-- row plus a badge recount for its author, which costs nothing when a human posts
-- one reply and costs real time when you insert forty thousand. That is the
-- production path though, so it stays. Budget roughly 3-4 minutes for
-- --replies=40000 and seconds for the default.
--
-- Note on random(): it is deliberately absent. A volatile function in a join
-- condition gets re-rolled for every row the planner scans, and one sitting in an
-- uncorrelated LATERAL gets evaluated once and reused for every row. Both failure
-- modes are quiet, and both produce data that looks fine until you count it.
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

\if :{?users}
\else
  \set users 500
\endif
\if :{?discussions}
\else
  \set discussions 800
\endif
\if :{?replies}
\else
  \set replies 6000
\endif
\if :{?events}
\else
  \set events 60
\endif

BEGIN;

SET LOCAL client_min_messages TO WARNING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Local-only guard
--
-- The dev admin account is created by seed.sql and exists nowhere else. If it is
-- missing we are either pointed at a database that was never seeded or, far
-- worse, at a real one. Either way, stop.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '018d224c-0e49-4b6d-b57a-87299605c2b1'
      AND email = 'contact@hivecom.net'
  ) THEN
    RAISE EXCEPTION 'Refusing to run: this does not look like a locally seeded database. Run npm run reset first.';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
--
-- Session-scoped, so they vanish with the connection and never need a migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- Stable pseudo-random number in [0, 1) derived from a key. Same key, same value,
-- every run and every machine.
CREATE FUNCTION pg_temp.bulk_rand(key text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('x' || substr(md5(key), 1, 7))::bit(28)::bigint::double precision / 268435456.0;
$$;

-- The activity curve from the metrics block in seed.sql. Roughly 0 at the 3am
-- trough, 1 at the 8pm Saturday peak.
CREATE FUNCTION pg_temp.bulk_activity(t timestamptz)
RETURNS double precision
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0.0,
    0.5 + 0.5 * COS(PI() * (EXTRACT(HOUR FROM t AT TIME ZONE 'Europe/Berlin') - 20.0) / 12.0)
  ) *
  CASE EXTRACT(DOW FROM t AT TIME ZONE 'Europe/Berlin')
    WHEN 0 THEN 1.0
    WHEN 1 THEN 0.55
    WHEN 2 THEN 0.60
    WHEN 3 THEN 0.65
    WHEN 4 THEN 0.70
    WHEN 5 THEN 0.85
    WHEN 6 THEN 1.0
  END;
$$;

-- Busiest of three candidate moments in a window. A cheap way to bias toward
-- evenings and weekends without a rejection loop.
CREATE FUNCTION pg_temp.bulk_when(window_start timestamptz, window_end timestamptz, key text)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT ts
  FROM (
    SELECT window_start + pg_temp.bulk_rand(key || '-c' || n) * (window_end - window_start) AS ts
    FROM generate_series(1, 3) n
  ) candidates
  ORDER BY pg_temp.bulk_activity(ts) DESC
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Members
--
-- The auth trigger that auto-creates a profile is disabled for this block. It
-- calls generate_username(), which counts every User% row before picking the next
-- number, so it turns a bulk insert quadratic. We write the profile row ourselves
-- instead, which is also the only way to backdate created_at - the audit trigger
-- pins created_at on UPDATE, so it has to be right on INSERT.
--
-- Join dates spread across the community's history, denser in recent years.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

CREATE TEMP TABLE bulk_users ON COMMIT DROP AS
WITH parts AS (
  SELECT
    ARRAY['frost','ember','void','nova','pixel','quiet','static','lunar','rust','neon',
          'amber','hollow','drift','cinder','vapor','glitch','tidal','onyx','solar','fern']::text[] AS adjectives,
    ARRAY['otter','falcon','moth','wolf','heron','crane','lynx','raven','koi','badger',
          'marten','shrike','ibex','tapir','gecko','magpie','stoat','osprey','viper','quokka']::text[] AS nouns,
    ARRAY['DE','DE','DE','US','US','GB','NL','SE','CA','PL','FR','AT','CH','DK','NO','FI','BE','CZ','ES','IE']::text[] AS countries
)
SELECT
  i,
  md5('hivecom-bulk-user-' || i)::uuid AS id,
  'bulk-' || i || '@hivecom.local' AS email,
  p.adjectives[1 + (i * 7 + 3) % array_length(p.adjectives, 1)]
    || '_' || p.nouns[1 + (i * 13 + 5) % array_length(p.nouns, 1)]
    || i AS username,
  p.countries[1 + (i * 11) % array_length(p.countries, 1)] AS country,
  -- Joins skew recent, because the community grew. The exponent pushes most
  -- accounts toward the back half of the window.
  (TIMESTAMPTZ '2013-06-01 00:00:00+00'
    + POWER(pg_temp.bulk_rand('joined-' || i), 0.55)
      * (NOW() - TIMESTAMPTZ '2013-06-01 00:00:00+00')) AS created_at,
  pg_temp.bulk_rand('u1-' || i) AS r1,
  pg_temp.bulk_rand('u2-' || i) AS r2,
  pg_temp.bulk_rand('u3-' || i) AS r3,
  pg_temp.bulk_rand('u4-' || i) AS r4
FROM generate_series(1, :users) i
CROSS JOIN parts p;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token,
  is_sso_user, is_anonymous
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  -- Same bcrypt hash as the seed accounts, so the shared dev password works.
  '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a',
  u.created_at,
  '{"provider": "email", "providers": ["email"]}',
  '{"email_verified": true}',
  u.created_at,
  u.created_at,
  NOW() - (u.r1 * INTERVAL '30 days'),
  '', '', '', '', '', '', '', '',
  FALSE,
  FALSE
FROM bulk_users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (
  id, username, created_at, last_seen, country, introduction, public,
  rich_presence_enabled, supporter_patreon, supporter_lifetime, birthday,
  steam_id, lastfm_username, username_set, agreed_content_rules, agreed_sharing_rules
)
SELECT
  u.id,
  u.username,
  u.created_at,
  NOW() - (u.r1 * INTERVAL '45 days'),
  u.country,
  CASE WHEN u.r2 < 0.6 THEN 'Been around since ' || to_char(u.created_at, 'YYYY') || '.' END,
  -- A slice of members keep their profile private, which is the case the profile
  -- RLS policies actually have to get right.
  u.r2 > 0.12,
  u.r3 < 0.55,
  u.r3 > 0.88,
  u.r3 > 0.97,
  CASE WHEN u.r4 < 0.4
    THEN (CURRENT_DATE - ((6570 + (u.r4 * 5000)::int) * INTERVAL '1 day'))::date
  END,
  CASE WHEN u.r3 < 0.55 THEN '765611980' || lpad((10000000 + u.i)::text, 8, '0') END,
  CASE WHEN u.r4 > 0.7 THEN 'bulk_lastfm_' || u.i END,
  TRUE,
  TRUE,
  TRUE
FROM bulk_users u
ON CONFLICT (id) DO NOTHING;

ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

-- Points ledger, matching the shape seed.sql gives the dev accounts.
INSERT INTO public.profile_points (profile_id, points_loyalty, points_donations, points_patreon, points_birthday, public)
SELECT
  u.id,
  GREATEST(0, EXTRACT(YEAR FROM AGE(NOW(), u.created_at))::int * 100),
  (u.r1 * 400)::int,
  CASE WHEN u.r3 > 0.88 THEN (u.r3 * 600)::int ELSE 0 END,
  (u.r4 * 50)::int,
  u.r2 > 0.2
FROM bulk_users u
ON CONFLICT (profile_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Forum discussions
--
-- Weighted toward General, because that is where a community actually talks.
-- Slugs carry a -b<n> suffix so they never collide with hand-written fixtures or
-- with each other.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE bulk_discussions ON COMMIT DROP AS
WITH parts AS (
  SELECT
    ARRAY['Best CS2 smokes for Mirage','Anyone up for Minecraft this weekend','Server lag last night',
          'Suggestion: rotate the GMod map pool','What are you all playing lately','Post your desk setup',
          'Movie night suggestions','New here, saying hi','Can we get a Factorio server',
          'Bandwidth costs and how we cover them','Favourite album this year','Teamspeak vs Discord, again',
          'Looking for people to grind ranked with','Screenshot dump from last night','Rules clarification please',
          'Feature request for the site','Anyone tried the new patch','Weekly game night poll',
          'Lost my save, is there a backup','Introducing a project I have been building']::text[] AS titles,
    ARRAY['general','general','general','general','general','general','general',
          'projects','projects','events','events','announcements']::text[] AS topics
)
SELECT
  i,
  md5('hivecom-bulk-discussion-' || i)::uuid AS id,
  p.titles[1 + (i * 17 + 4) % array_length(p.titles, 1)] AS title,
  p.topics[1 + (i * 5 + 2) % array_length(p.topics, 1)] AS topic_slug,
  1 + FLOOR(pg_temp.bulk_rand('disc-author-' || i) * :users)::int AS author_i,
  pg_temp.bulk_when(NOW() - INTERVAL '2 years', NOW() - INTERVAL '1 hour', 'disc-' || i) AS created_at,
  pg_temp.bulk_rand('d1-' || i) AS r1,
  pg_temp.bulk_rand('d2-' || i) AS r2
FROM generate_series(1, :discussions) i
CROSS JOIN parts p;

INSERT INTO public.discussions (
  id, created_at, created_by, title, slug, description, markdown,
  discussion_topic_id, is_sticky, is_locked, is_archived, is_nsfw, view_count
)
SELECT
  d.id,
  d.created_at,
  author.id,
  d.title,
  public.slugify(d.title) || '-b' || d.i,
  'Generated discussion for local volume testing.',
  d.title || E'\n\nGenerated by seed.bulk.sql to give the forum something to page through. '
    || 'Thread ' || d.i || ' of ' || :discussions || ', opened ' || to_char(d.created_at, 'FMDay DD Mon YYYY') || '.',
  t.id,
  d.r1 > 0.985,
  d.r1 < 0.02,
  d.r2 < 0.03,
  d.r2 > 0.98,
  (d.r1 * 4000)::int
FROM bulk_discussions d
JOIN public.discussion_topics t ON t.slug = d.topic_slug
JOIN bulk_users author ON author.i = d.author_i
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Replies
--
-- Deliberately lopsided. Cubing the draw when picking a thread means a handful of
-- discussions collect hundreds of replies while most get a few, which is both
-- what forums look like and the only shape that puts real pressure on reply
-- pagination and subscriber fan-out.
--
-- Reply times sit between the thread opening and now, weighted early, then nudged
-- toward the evening peak by the same activity curve.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE bulk_ranked_discussions ON COMMIT DROP AS
SELECT
  ROW_NUMBER() OVER (ORDER BY md5('rank-' || d.i)) - 1 AS rank,
  d.id,
  d.created_at
FROM bulk_discussions d;

INSERT INTO public.discussion_replies (id, discussion_id, created_by, created_at, markdown, is_offtopic)
SELECT
  md5('hivecom-bulk-reply-' || r.i)::uuid,
  target.id,
  author.id,
  reply_at.ts,
  CASE (r.i % 6)
    WHEN 0 THEN 'Agreed, that matches what I saw on my end.'
    WHEN 1 THEN 'Works for me. I am around most evenings after 8 if anyone wants to join.'
    WHEN 2 THEN 'Not sure about that one. Did anyone else run into it?'
    WHEN 3 THEN 'Thanks for writing this up, saved me a lot of guessing.'
    WHEN 4 THEN 'Bumping this because I would still like to see it happen.'
    ELSE 'Count me in.'
  END,
  draw.is_offtopic
FROM generate_series(1, :replies) r(i)
CROSS JOIN LATERAL (
  SELECT
    FLOOR(POWER(pg_temp.bulk_rand('reply-thread-' || r.i), 3)
      * (SELECT COUNT(*) FROM bulk_ranked_discussions))::bigint AS thread_rank,
    1 + FLOOR(pg_temp.bulk_rand('reply-author-' || r.i) * :users)::int AS author_i,
    POWER(pg_temp.bulk_rand('reply-lag-' || r.i), 2.2) AS lag,
    pg_temp.bulk_rand('reply-ot-' || r.i) < 0.04 AS is_offtopic
) draw
JOIN bulk_ranked_discussions target ON target.rank = draw.thread_rank
JOIN bulk_users author ON author.i = draw.author_i
CROSS JOIN LATERAL (
  SELECT pg_temp.bulk_when(
    target.created_at + draw.lag * (NOW() - target.created_at),
    LEAST(NOW(), target.created_at + draw.lag * (NOW() - target.created_at) + INTERVAL '6 hours'),
    'reply-when-' || r.i
  ) AS ts
) reply_at
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Events and RSVPs
--
-- Explicit IDs from 900000 up, so they never fight the identity sequence the
-- fixtures use.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE bulk_events ON COMMIT DROP AS
SELECT
  i,
  900000 + i AS id,
  CASE (i % 5)
    WHEN 0 THEN 'Community Game Night'
    WHEN 1 THEN 'Minecraft Build Session'
    WHEN 2 THEN 'CS2 Scrim'
    WHEN 3 THEN 'Movie Night'
    ELSE 'Open Voice Hangout'
  END || ' #' || i AS title,
  pg_temp.bulk_when(NOW() - INTERVAL '18 months', NOW() + INTERVAL '4 months', 'event-' || i) AS date,
  1 + FLOOR(pg_temp.bulk_rand('event-host-' || i) * :users)::int AS host_i,
  pg_temp.bulk_rand('e1-' || i) AS r1
FROM generate_series(1, :events) i;

INSERT INTO public.events (id, created_at, created_by, date, title, description, location, duration_minutes, is_official)
SELECT
  e.id,
  e.date - INTERVAL '3 weeks',
  host.id,
  e.date,
  e.title,
  'Recurring community slot, generated for local volume testing.',
  CASE WHEN e.r1 < 0.7 THEN 'Voice Channels' ELSE 'Online' END,
  60 + (e.r1 * 180)::int,
  e.r1 > 0.6
FROM bulk_events e
JOIN bulk_users host ON host.i = e.host_i
ON CONFLICT (id) DO NOTHING;

-- Attendance is thicker on upcoming events, which is where the RSVP list and its
-- realtime updates actually get looked at. The pairing is a hash of the event and
-- the member, so the same people attend the same events on every run.
INSERT INTO public.event_rsvps (event_id, user_id, created_by, rsvp, scope, created_at)
SELECT
  e.id,
  u.id,
  u.id,
  (CASE
    WHEN pg_temp.bulk_rand('rsvp-answer-' || e.i || '-' || u.i) < 0.72 THEN 'yes'
    WHEN pg_temp.bulk_rand('rsvp-answer-' || e.i || '-' || u.i) < 0.89 THEN 'tentative'
    ELSE 'no'
  END)::public.events_rsvp_status,
  'occurrence'::public.events_rsvp_scope,
  e.date - INTERVAL '10 days'
FROM bulk_events e
JOIN bulk_users u
  ON pg_temp.bulk_rand('rsvp-' || e.i || '-' || u.i)
     < (CASE WHEN e.date > NOW() THEN 0.22 ELSE 0.08 END)
ON CONFLICT (user_id, event_id, scope, occurrence_date) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Statistics
--
-- Without this the planner still thinks these tables hold a couple of dozen rows,
-- and every plan you look at afterwards is shaped by an estimate that is off by
-- three orders of magnitude. That makes the whole exercise misleading, so it is
-- part of the seed rather than something to remember to run.
-- ─────────────────────────────────────────────────────────────────────────────

ANALYZE public.profiles;
ANALYZE public.discussions;
ANALYZE public.discussion_replies;
ANALYZE public.discussion_topics;
ANALYZE public.discussion_subscriptions;
ANALYZE public.events;
ANALYZE public.event_rsvps;
ANALYZE public.user_notifications;
ANALYZE public.profile_points;
ANALYZE public.profile_badges;

-- ─────────────────────────────────────────────────────────────────────────────
-- What landed
-- ─────────────────────────────────────────────────────────────────────────────

\echo ''
SELECT
  (SELECT COUNT(*) FROM public.profiles)           AS profiles,
  (SELECT COUNT(*) FROM public.discussions)        AS discussions,
  (SELECT COUNT(*) FROM public.discussion_replies) AS replies,
  (SELECT COUNT(*) FROM public.events)             AS events,
  (SELECT COUNT(*) FROM public.event_rsvps)        AS rsvps,
  (SELECT COUNT(*) FROM public.user_notifications) AS notifications;

\echo 'Busiest threads:'
SELECT d.title, d.reply_count
FROM public.discussions d
WHERE d.reply_count > 0
ORDER BY d.reply_count DESC
LIMIT 5;
