-- Fix cron_metrics_daily_rollup: read and write the `users` key, not `members`.
--
-- The metrics payload key was renamed members -> users on 2026-05-14, which
-- updated get_metrics_bucketed and the app but left this function behind.
-- Its shape guard checks `data ? 'members'`, which no row has satisfied since
-- the rename, so every eligible day hit CONTINUE. The function returns void
-- and only RAISE NOTICEs on that path, so pg_cron logged 90 days of clean
-- successes while rolling up exactly zero rows.
--
-- Four changes:
--
--   1. members -> users in the shape guard, in every extraction path, and in
--      the output payload. All three had to move together: fixing only the
--      guard would collapse days into rows keyed `members` that the read RPC
--      (which reads data->'users') renders as zeros, after deleting the raw
--      rows they came from.
--
--   2. `storage` is no longer a required key. The collector only started
--      writing it on 2026-05-07, so requiring it would strand 2026-05-02
--      through 2026-05-07 permanently. The storage block already degrades
--      to '{}' when the key is absent, so nothing is lost.
--
--   3. The day boundary is built with `v_day::timestamp AT TIME ZONE 'UTC'`.
--      The old `v_day::timestamptz AT TIME ZONE 'UTC'` reads the session
--      timezone on the way in and again on the way out, so it only lands on
--      midnight UTC when the session is already UTC.
--
--   4. collectedAt is emitted as ISO-8601 with a Z, matching raw rows. The
--      old text cast produced `2026-05-02 00:00:00`, which JS Date parses as
--      local time.
--
-- Aggregation rules are unchanged from 20260507183548, with `users` in place
-- of `members`:
--   users.online            MAX  (peak concurrent)
--   users.total             AVG  (point-in-time count)
--   users.byCountry         MAX per key (demographic peak)
--   users.byGame            MAX per key (peak concurrent per game)
--   users.bySteamGame       MAX per key (peak concurrent per Steam game)
--   community.projects      AVG  (point-in-time count)
--   discussions.total       AVG  (point-in-time count)
--   discussions.replies     AVG  (point-in-time count)
--   discussions.newTotal    SUM  (incremental delta)
--   discussions.newReplies  SUM  (incremental delta)
--   teamspeak.online        MAX  (peak concurrent)
--   teamspeak.byServer      AVG per key (activity distribution)
--   gameservers.total       AVG  (point-in-time count)
--   gameservers.players     MAX  (peak concurrent)
--   gameservers.byServer    MAX players per server key
--   storage.buckets         AVG totalFiles/totalSize/totalImages per key;
--                           SUM deltaFiles/deltaSize per key (incremental)

CREATE OR REPLACE FUNCTION public.cron_metrics_daily_rollup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff     date := (now() AT TIME ZONE 'UTC')::date - 90;
  v_day        date;
  v_day_ids    bigint[];
  v_payload    jsonb;

  -- per-key aggregation intermediates
  v_by_country   jsonb;
  v_by_game      jsonb;
  v_by_steam     jsonb;
  v_ts_by_server jsonb;
  v_gs_by_server jsonb;
  v_buckets      jsonb;
BEGIN
  -- Iterate over each UTC day that has raw (non-aggregated) rows older than cutoff
  FOR v_day IN
    SELECT DISTINCT (captured_at AT TIME ZONE 'UTC')::date AS day
    FROM   public.metrics
    WHERE  (captured_at AT TIME ZONE 'UTC')::date < v_cutoff
      AND  is_aggregated = false
    ORDER  BY day
  LOOP
    -- Collect IDs for this day
    SELECT array_agg(id)
      INTO v_day_ids
    FROM public.metrics
    WHERE (captured_at AT TIME ZONE 'UTC')::date = v_day
      AND is_aggregated = false;

    IF v_day_ids IS NULL THEN
      CONTINUE;
    END IF;

    -- ----------------------------------------------------------------
    -- Validation: every row must have all required top-level keys.
    -- If any row is missing one, skip the whole day. `storage` is not
    -- required - it postdates the oldest rows and aggregates to '{}'.
    -- ----------------------------------------------------------------
    IF EXISTS (
      SELECT 1
      FROM   public.metrics
      WHERE  id = ANY(v_day_ids)
        AND  NOT (
               (data ? 'users')       AND
               (data ? 'community')   AND
               (data ? 'discussions') AND
               (data ? 'teamspeak')   AND
               (data ? 'gameservers')
             )
    ) THEN
      RAISE NOTICE 'cron_metrics_daily_rollup: skipping day % - one or more rows have unexpected shape', v_day;
      CONTINUE;
    END IF;

    -- ----------------------------------------------------------------
    -- users.byCountry: MAX per key across the day
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, max_val)
      INTO v_by_country
    FROM (
      SELECT kv.key,
             MAX(COALESCE((kv.value)::numeric, 0))::int AS max_val
      FROM   public.metrics m,
             jsonb_each_text(m.data -> 'users' -> 'byCountry') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- users.byGame: MAX per key (peak concurrent per game)
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, max_val)
      INTO v_by_game
    FROM (
      SELECT kv.key,
             MAX(COALESCE((kv.value)::numeric, 0))::int AS max_val
      FROM   public.metrics m,
             jsonb_each_text(m.data -> 'users' -> 'byGame') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- users.bySteamGame: MAX per key (peak concurrent per Steam game)
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, max_val)
      INTO v_by_steam
    FROM (
      SELECT kv.key,
             MAX(COALESCE((kv.value)::numeric, 0))::int AS max_val
      FROM   public.metrics m,
             jsonb_each_text(m.data -> 'users' -> 'bySteamGame') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- teamspeak.byServer: AVG per key
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, avg_val)
      INTO v_ts_by_server
    FROM (
      SELECT kv.key,
             ROUND(AVG(COALESCE((kv.value)::numeric, 0)))::int AS avg_val
      FROM   public.metrics m,
             jsonb_each_text(m.data -> 'teamspeak' -> 'byServer') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- gameservers.byServer: MAX players per server key.
    -- Output preserves the exact MetricsServerDetail shape per protocol so
    -- rollup rows are structurally identical to raw rows. Minecraft uses
    -- numPlayers, all others use players - matching the original field names
    -- means the bucketed RPC needs no special handling for aggregated rows.
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, jsonb_build_object(
             'protocol', protocol,
             'data',     CASE
                           WHEN protocol IS NULL
                           THEN NULL
                           WHEN protocol = 'minecraft'
                           THEN jsonb_build_object('numPlayers', max_players)
                           ELSE jsonb_build_object('players',    max_players)
                         END
           ))
      INTO v_gs_by_server
    FROM (
      SELECT kv.key,
             kv.value ->> 'protocol' AS protocol,
             MAX(
               CASE
                 WHEN (kv.value ->> 'protocol') = 'minecraft'
                 THEN COALESCE((kv.value -> 'data' ->> 'numPlayers')::numeric, 0)
                 WHEN (kv.value ->> 'protocol') IS NULL
                 THEN 0
                 ELSE COALESCE((kv.value -> 'data' ->> 'players')::numeric,    0)
               END
             )::int AS max_players
      FROM   public.metrics m,
             jsonb_each(m.data -> 'gameservers' -> 'byServer') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key, kv.value ->> 'protocol'
    ) t;

    -- ----------------------------------------------------------------
    -- storage.buckets: AVG totalFiles/totalSize/totalImages, SUM deltas.
    -- Days predating the storage collector aggregate to '{}'.
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, jsonb_build_object(
             'totalFiles',  avg_total_files,
             'totalSize',   avg_total_size,
             'totalImages', avg_total_images,
             'deltaFiles',  sum_delta_files,
             'deltaSize',   sum_delta_size
           ))
      INTO v_buckets
    FROM (
      SELECT kv.key,
             ROUND(AVG(COALESCE((kv.value ->> 'totalFiles')::numeric,  0)))::bigint AS avg_total_files,
             ROUND(AVG(COALESCE((kv.value ->> 'totalSize')::numeric,   0)))::bigint AS avg_total_size,
             ROUND(AVG(COALESCE((kv.value ->> 'totalImages')::numeric, 0)))::bigint AS avg_total_images,
             SUM(      COALESCE((kv.value ->> 'deltaFiles')::numeric,  0))::bigint  AS sum_delta_files,
             SUM(      COALESCE((kv.value ->> 'deltaSize')::numeric,   0))::bigint  AS sum_delta_size
      FROM   public.metrics m,
             jsonb_each(m.data -> 'storage' -> 'buckets') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- Build final aggregated payload
    -- ----------------------------------------------------------------
    SELECT jsonb_build_object(
      'collectedAt', to_char(v_day, 'YYYY-MM-DD') || 'T00:00:00.000Z',
      'users', jsonb_build_object(
        'online',      MAX(COALESCE((data -> 'users' ->> 'online')::numeric,      0))::int,
        'total',       ROUND(AVG(COALESCE((data -> 'users' ->> 'total')::numeric, 0)))::int,
        'byCountry',   COALESCE(v_by_country,   '{}'::jsonb),
        'byGame',      COALESCE(v_by_game,       '{}'::jsonb),
        'bySteamGame', COALESCE(v_by_steam,      '{}'::jsonb)
      ),
      'community', jsonb_build_object(
        'projects', ROUND(AVG(COALESCE((data -> 'community' ->> 'projects')::numeric, 0)))::int
      ),
      'discussions', jsonb_build_object(
        'total',      ROUND(AVG(COALESCE((data -> 'discussions' ->> 'total')::numeric,      0)))::int,
        'replies',    ROUND(AVG(COALESCE((data -> 'discussions' ->> 'replies')::numeric,    0)))::int,
        'newTotal',   SUM(      COALESCE((data -> 'discussions' ->> 'newTotal')::numeric,   0))::int,
        'newReplies', SUM(      COALESCE((data -> 'discussions' ->> 'newReplies')::numeric, 0))::int
      ),
      'teamspeak', jsonb_build_object(
        'online',    MAX(COALESCE((data -> 'teamspeak' ->> 'online')::numeric, 0))::int,
        'byServer',  COALESCE(v_ts_by_server, '{}'::jsonb)
      ),
      'gameservers', jsonb_build_object(
        'total',     ROUND(AVG(COALESCE((data -> 'gameservers' ->> 'total')::numeric,   0)))::int,
        'players',   MAX(      COALESCE((data -> 'gameservers' ->> 'players')::numeric, 0))::int,
        'byServer',  COALESCE(v_gs_by_server, '{}'::jsonb)
      ),
      'storage', jsonb_build_object(
        'buckets', COALESCE(v_buckets, '{}'::jsonb)
      )
    )
      INTO v_payload
    FROM public.metrics
    WHERE id = ANY(v_day_ids);

    -- ----------------------------------------------------------------
    -- Insert aggregated row, delete originals
    -- ----------------------------------------------------------------
    INSERT INTO public.metrics (captured_at, data, is_aggregated)
    VALUES (
      v_day::timestamp AT TIME ZONE 'UTC',
      v_payload,
      true
    );

    DELETE FROM public.metrics
    WHERE id = ANY(v_day_ids);

    RAISE NOTICE 'cron_metrics_daily_rollup: rolled up % rows for day %', array_length(v_day_ids, 1), v_day;
  END LOOP;
END;
$$;
