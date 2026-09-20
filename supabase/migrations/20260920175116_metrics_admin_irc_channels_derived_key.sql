-- Derived public key for secret IRC channels
--
-- Secret (+s) channels are keyed in the public `metrics` snapshots by an opaque
-- value instead of their name, so message volume stays public without the name
-- being public. That value was `id`, a random uuid, which meant the mapping
-- only existed in this table and only `metrics_admin.read` could use it. A
-- member of the channel, who already knows the name, still couldn't pick their
-- own channel out of the data.
--
-- Keying by sha256 of the lowercased name instead makes the mapping derivable
-- by anyone who already knows the name: the chat client hashes the channels it
-- has joined and matches them against the snapshot locally, with nothing handed
-- out server-side. Guessing a name confirms only what the snapshot already
-- publishes for that row, and the snapshot's `channels` count already says how
-- many secret channels exist.
--
-- `id` stays the primary key and the admin lookup keeps working. It just stops
-- being what the public snapshot prints.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Derived key column
-- ─────────────────────────────────────────────────────────────────────────────

-- Generated rather than written by the collector so the stored value and the
-- definition can't drift. Lowercased because IRC names are case insensitive
-- while `name` here preserves Ergo's display case.
ALTER TABLE public.metrics_admin_irc_channels
  ADD COLUMN key text
  GENERATED ALWAYS AS (encode(sha256(lower(name)::bytea), 'hex')) STORED;

COMMENT ON COLUMN public.metrics_admin_irc_channels.key
  IS 'sha256 hex of the lowercased channel name. Stands in for the name in public metrics while the channel is secret, and is derivable by any client that knows the name.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rewrite historical snapshots onto the new key
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every `metrics` row carries the keys the collector used at write time, and
-- rolled up days are kept rather than expired (see metrics_daily_rollup), so
-- without this the uuid-keyed series simply ends on the day the collector
-- switches and a second series begins beside it.
--
-- Channels that have since turned public map back to their name, which is what
-- current rows use for them, healing the same split from an earlier flip.

WITH channel_keys AS (
  SELECT
    id::text AS old_key,
    CASE WHEN secret THEN key ELSE name END AS new_key
  FROM public.metrics_admin_irc_channels
)
UPDATE public.metrics m
SET data = jsonb_set(
  m.data,
  '{irc,byChannel}',
  (
    SELECT COALESCE(jsonb_object_agg(COALESCE(c.new_key, kv.key), kv.value), '{}'::jsonb)
    FROM jsonb_each(m.data -> 'irc' -> 'byChannel') AS kv(key, value)
    LEFT JOIN channel_keys c ON c.old_key = kv.key
  )
)
WHERE m.data -> 'irc' ? 'byChannel';

WITH channel_keys AS (
  SELECT
    id::text AS old_key,
    CASE WHEN secret THEN key ELSE name END AS new_key
  FROM public.metrics_admin_irc_channels
)
UPDATE public.metrics m
SET data = jsonb_set(
  m.data,
  '{irc,messagesByChannel}',
  (
    SELECT COALESCE(jsonb_object_agg(COALESCE(c.new_key, kv.key), kv.value), '{}'::jsonb)
    FROM jsonb_each(m.data -> 'irc' -> 'messagesByChannel') AS kv(key, value)
    LEFT JOIN channel_keys c ON c.old_key = kv.key
  )
)
WHERE m.data -> 'irc' ? 'messagesByChannel';

COMMIT;
