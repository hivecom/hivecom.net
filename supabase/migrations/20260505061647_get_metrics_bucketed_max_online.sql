-- RPC: get_metrics_bucketed (update)
-- Switch peak-count metrics (online members, TS online, gameserver players) from AVG to MAX.
-- Snapshot counters (members_total, discussions_total/replies) stay as AVG.
-- Incremental deltas (discussions_new_*) stay as SUM.

CREATE OR REPLACE FUNCTION get_metrics_bucketed(
  p_since           timestamptz,
  p_until           timestamptz,
  p_bucket_interval interval
)
RETURNS TABLE (
  captured_at             timestamptz,
  members_online          int,
  members_total           int,
  teamspeak_online        int,
  gameservers_players     int,
  teamspeak_by_server     jsonb,
  gameservers_by_server   jsonb,
  discussions_total       int,
  discussions_replies     int,
  discussions_new_total   int,
  discussions_new_replies int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH

  -- -------------------------------------------------------------------------
  -- 1. Assign each row to a bucket boundary
  -- -------------------------------------------------------------------------
  bucketed AS (
    SELECT
      date_bin(p_bucket_interval, m.captured_at, TIMESTAMPTZ '2001-01-01') AS bucket,

      -- Peak counts (will use MAX)
      (m.data -> 'members'     ->> 'online')::numeric   AS members_online,
      (m.data -> 'teamspeak'   ->> 'online')::numeric   AS teamspeak_online,
      (m.data -> 'gameservers' ->> 'players')::numeric  AS gameservers_players,

      -- Snapshot counters (will use AVG)
      (m.data -> 'members'     ->> 'total')::numeric      AS members_total,
      (m.data -> 'discussions' ->> 'total')::numeric      AS discussions_total,
      (m.data -> 'discussions' ->> 'replies')::numeric    AS discussions_replies,

      -- Incremental deltas (will use SUM)
      (m.data -> 'discussions' ->> 'newTotal')::numeric   AS discussions_new_total,
      (m.data -> 'discussions' ->> 'newReplies')::numeric AS discussions_new_replies,

      -- JSONB sub-objects for per-key aggregation
      (m.data -> 'teamspeak'   -> 'byServer') AS ts_by_server,
      (m.data -> 'gameservers' -> 'byServer') AS gs_by_server

    FROM metrics m
    WHERE m.captured_at >= p_since
      AND m.captured_at <  p_until
  ),

  -- -------------------------------------------------------------------------
  -- 2. Expand teamspeak.byServer keys and compute per-(bucket, key) peak
  -- -------------------------------------------------------------------------
  ts_expanded AS (
    SELECT
      b.bucket,
      kv.key,
      MAX(kv.value::numeric) AS max_val
    FROM bucketed b,
         jsonb_each_text(b.ts_by_server) AS kv(key, value)
    GROUP BY b.bucket, kv.key
  ),

  ts_aggregated AS (
    SELECT
      bucket,
      jsonb_object_agg(key, max_val::int) AS ts_by_server
    FROM ts_expanded
    GROUP BY bucket
  ),

  -- -------------------------------------------------------------------------
  -- 3. Expand gameservers.byServer keys, drill into data.players, peak
  -- -------------------------------------------------------------------------
  gs_expanded AS (
    SELECT
      b.bucket,
      kv.key,
      MAX((kv.value -> 'data' ->> 'players')::numeric) AS max_players
    FROM bucketed b,
         jsonb_each(b.gs_by_server) AS kv(key, value)
    GROUP BY b.bucket, kv.key
  ),

  gs_aggregated AS (
    SELECT
      bucket,
      jsonb_object_agg(key, max_players::int) AS gs_by_server
    FROM gs_expanded
    GROUP BY bucket
  ),

  -- -------------------------------------------------------------------------
  -- 4. Aggregate scalar columns per bucket
  -- -------------------------------------------------------------------------
  scalar_agg AS (
    SELECT
      bucket,
      MAX(members_online)::int                 AS members_online,
      ROUND(AVG(members_total))::int           AS members_total,
      MAX(teamspeak_online)::int               AS teamspeak_online,
      MAX(gameservers_players)::int            AS gameservers_players,
      ROUND(AVG(discussions_total))::int       AS discussions_total,
      ROUND(AVG(discussions_replies))::int     AS discussions_replies,
      SUM(discussions_new_total)::int          AS discussions_new_total,
      SUM(discussions_new_replies)::int        AS discussions_new_replies
    FROM bucketed
    GROUP BY bucket
  ),

  -- -------------------------------------------------------------------------
  -- 5. Full bucket series (gap-fill)
  -- -------------------------------------------------------------------------
  series AS (
    SELECT gs.bucket
    FROM generate_series(
      date_bin(p_bucket_interval, p_since, TIMESTAMPTZ '2001-01-01'),
      date_bin(p_bucket_interval, p_until, TIMESTAMPTZ '2001-01-01'),
      p_bucket_interval
    ) AS gs(bucket)
  )

  -- -------------------------------------------------------------------------
  -- 6. Left-join series against aggregated data
  -- -------------------------------------------------------------------------
  SELECT
    s.bucket                    AS captured_at,
    sa.members_online,
    sa.members_total,
    sa.teamspeak_online,
    sa.gameservers_players,
    ta.ts_by_server             AS teamspeak_by_server,
    ga.gs_by_server             AS gameservers_by_server,
    sa.discussions_total,
    sa.discussions_replies,
    sa.discussions_new_total,
    sa.discussions_new_replies
  FROM series s
  LEFT JOIN scalar_agg    sa ON sa.bucket = s.bucket
  LEFT JOIN ts_aggregated ta ON ta.bucket = s.bucket
  LEFT JOIN gs_aggregated ga ON ga.bucket = s.bucket
  ORDER BY s.bucket;
$$;

GRANT EXECUTE ON FUNCTION get_metrics_bucketed(timestamptz, timestamptz, interval)
  TO anon, authenticated;
