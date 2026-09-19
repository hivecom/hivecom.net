-- Read gameserver player counts by field, not by protocol name.
--
-- get_metrics_bucketed and cron_metrics_daily_rollup only knew Minecraft as
-- the protocol that reports `numPlayers`; every other protocol was read from
-- `players`. GameSpy, Factorio and Trackmania also report `numPlayers`, and
-- their `players` key holds the name list (nulled in history), so their
-- per-server history came out as NULL or 0 while the live badge was right.
--
-- metrics_gameserver_player_count() takes whichever of the two keys holds a
-- number. Satisfactory has neither and stays NULL, matching the app's
-- metricsPlayerCount. Rollup rows write `numPlayers` for every protocol except
-- source, so aggregated days read back through the same helper.

CREATE OR REPLACE FUNCTION public.metrics_gameserver_player_count(p_detail jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE STRICT SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_detail -> 'data' -> 'numPlayers') = 'number'
    THEN (p_detail -> 'data' ->> 'numPlayers')::numeric
    WHEN jsonb_typeof(p_detail -> 'data' -> 'players') = 'number'
    THEN (p_detail -> 'data' ->> 'players')::numeric
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION public.metrics_gameserver_player_count(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.metrics_gameserver_player_count(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_metrics_bucketed(
  p_since timestamp with time zone,
  p_until timestamp with time zone,
  p_bucket_interval interval
)
RETURNS TABLE(
  captured_at timestamp with time zone,
  users_online integer,
  users_total integer,
  teamspeak_online integer,
  gameservers_players integer,
  teamspeak_by_server jsonb,
  gameservers_by_server jsonb,
  users_by_game jsonb,
  users_by_steam_game jsonb,
  discussions_total integer,
  discussions_replies integer,
  discussions_new_total integer,
  discussions_new_replies integer,
  irc_online integer,
  irc_channels integer,
  irc_messages integer,
  irc_by_channel jsonb,
  irc_messages_by_channel jsonb
)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH

  src AS MATERIALIZED (
    SELECT
      date_bin(p_bucket_interval, m.captured_at, TIMESTAMPTZ '2001-01-01') AS bucket,
      (x.d -> 'users'       ->> 'online')::numeric   AS users_online,
      (x.d -> 'users'       ->> 'total')::numeric    AS users_total,
      (x.d -> 'teamspeak'   ->> 'online')::numeric   AS teamspeak_online,
      (x.d -> 'gameservers' ->> 'players')::numeric  AS gameservers_players,
      (x.d -> 'discussions' ->> 'total')::numeric      AS discussions_total,
      (x.d -> 'discussions' ->> 'replies')::numeric    AS discussions_replies,
      (x.d -> 'discussions' ->> 'newTotal')::numeric   AS discussions_new_total,
      (x.d -> 'discussions' ->> 'newReplies')::numeric AS discussions_new_replies,
      (x.d -> 'irc'         ->> 'online')::numeric     AS irc_online,
      (x.d -> 'irc'         ->> 'channels')::numeric   AS irc_channels,
      (x.d -> 'irc'         ->> 'messages')::numeric   AS irc_messages,
      (x.d -> 'teamspeak'   -> 'byServer')    AS ts_obj,
      (x.d -> 'gameservers' -> 'byServer')    AS gs_obj,
      (x.d -> 'users'       -> 'byGame')      AS game_obj,
      (x.d -> 'users'       -> 'bySteamGame') AS steam_obj,
      (x.d -> 'irc'         -> 'byChannel')         AS irc_chan_obj,
      (x.d -> 'irc'         -> 'messagesByChannel') AS irc_msg_obj
    FROM public.metrics m
    -- `||` yields a freshly built in-memory jsonb, so the extractions above
    -- detoast m.data once instead of once each.
    CROSS JOIN LATERAL (SELECT m.data || '{}'::jsonb AS d) x
    WHERE m.captured_at >= p_since
      AND m.captured_at <  p_until
  ),

  scalar_agg AS (
    SELECT
      bucket,
      MAX(users_online)::int                   AS users_online,
      ROUND(AVG(users_total))::int             AS users_total,
      MAX(teamspeak_online)::int               AS teamspeak_online,
      MAX(gameservers_players)::int            AS gameservers_players,
      ROUND(AVG(discussions_total))::int       AS discussions_total,
      ROUND(AVG(discussions_replies))::int     AS discussions_replies,
      SUM(discussions_new_total)::int          AS discussions_new_total,
      SUM(discussions_new_replies)::int        AS discussions_new_replies,
      MAX(irc_online)::int                     AS irc_online,
      MAX(irc_channels)::int                   AS irc_channels,
      SUM(irc_messages)::int                   AS irc_messages
    FROM src
    GROUP BY bucket
  ),

  map_keyed AS (
    SELECT
      s.bucket,
      maps.tag,
      kv.key,
      MAX(
        CASE
          WHEN maps.tag = 'gs' THEN public.metrics_gameserver_player_count(kv.value)
          ELSE (kv.value #>> '{}')::numeric
        END
      ) AS max_val,
      SUM(
        CASE
          WHEN maps.tag = 'ircmsg' THEN (kv.value #>> '{}')::numeric
          ELSE NULL
        END
      ) AS sum_val
    FROM src s
    CROSS JOIN LATERAL (
      VALUES
        ('ts',     s.ts_obj),
        ('gs',     s.gs_obj),
        ('game',   s.game_obj),
        ('steam',  s.steam_obj),
        ('irc',    s.irc_chan_obj),
        ('ircmsg', s.irc_msg_obj)
    ) AS maps(tag, obj)
    CROSS JOIN LATERAL jsonb_each(maps.obj) AS kv(key, value)
    GROUP BY s.bucket, maps.tag, kv.key
  ),

  map_agg AS (
    SELECT
      bucket,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'ts')     AS ts_by_server,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'gs')     AS gs_by_server,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'game')   AS users_by_game,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'steam')  AS users_by_steam_game,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'irc')    AS irc_by_channel,
      jsonb_object_agg(key, sum_val::int) FILTER (WHERE tag = 'ircmsg') AS irc_messages_by_channel
    FROM map_keyed
    GROUP BY bucket
  ),

  series AS (
    SELECT gs.bucket
    FROM generate_series(
      date_bin(p_bucket_interval, p_since + p_bucket_interval, TIMESTAMPTZ '2001-01-01'),
      date_bin(p_bucket_interval, p_until,                     TIMESTAMPTZ '2001-01-01'),
      p_bucket_interval
    ) AS gs(bucket)
  )

  SELECT
    s.bucket                                     AS captured_at,
    sa.users_online,
    sa.users_total,
    sa.teamspeak_online,
    sa.gameservers_players,
    ma.ts_by_server                              AS teamspeak_by_server,
    ma.gs_by_server                              AS gameservers_by_server,
    ma.users_by_game,
    ma.users_by_steam_game,
    sa.discussions_total,
    sa.discussions_replies,
    sa.discussions_new_total,
    sa.discussions_new_replies,
    sa.irc_online,
    sa.irc_channels,
    sa.irc_messages,
    ma.irc_by_channel,
    ma.irc_messages_by_channel
  FROM series s
  LEFT JOIN scalar_agg sa ON sa.bucket = s.bucket
  LEFT JOIN map_agg    ma ON ma.bucket = s.bucket
  ORDER BY s.bucket;
$function$;

GRANT EXECUTE ON FUNCTION public.get_metrics_bucketed(timestamptz, timestamptz, interval)
  TO anon, authenticated;

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
  v_irc_by_chan  jsonb;
  v_irc_msg_chan jsonb;
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
    -- irc.byChannel: MAX per key (peak concurrent per channel).
    -- Days predating the IRC collector aggregate to '{}'.
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, max_val)
      INTO v_irc_by_chan
    FROM (
      SELECT kv.key,
             MAX(COALESCE((kv.value)::numeric, 0))::int AS max_val
      FROM   public.metrics m,
             jsonb_each_text(m.data -> 'irc' -> 'byChannel') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- irc.messagesByChannel: SUM per key (each row holds one interval)
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, sum_val)
      INTO v_irc_msg_chan
    FROM (
      SELECT kv.key,
             SUM(COALESCE((kv.value)::numeric, 0))::int AS sum_val
      FROM   public.metrics m,
             jsonb_each_text(m.data -> 'irc' -> 'messagesByChannel') AS kv(key, value)
      WHERE  m.id = ANY(v_day_ids)
      GROUP  BY kv.key
    ) t;

    -- ----------------------------------------------------------------
    -- gameservers.byServer: MAX players per server key.
    -- Output keeps the MetricsServerDetail shape per protocol so rollup rows
    -- read back like raw rows. Source reports `players`, every other protocol
    -- `numPlayers`; metrics_gameserver_player_count() accepts either.
    -- ----------------------------------------------------------------
    SELECT jsonb_object_agg(key, jsonb_build_object(
             'protocol', protocol,
             'data',     CASE
                           WHEN protocol IS NULL
                           THEN NULL
                           WHEN protocol = 'source'
                           THEN jsonb_build_object('players',    max_players)
                           ELSE jsonb_build_object('numPlayers', max_players)
                         END
           ))
      INTO v_gs_by_server
    FROM (
      SELECT kv.key,
             kv.value ->> 'protocol' AS protocol,
             MAX(COALESCE(public.metrics_gameserver_player_count(kv.value), 0))::int AS max_players
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
      'irc', jsonb_build_object(
        'online',            MAX(COALESCE((data -> 'irc' ->> 'online')::numeric,   0))::int,
        'channels',          MAX(COALESCE((data -> 'irc' ->> 'channels')::numeric, 0))::int,
        'messages',          SUM(COALESCE((data -> 'irc' ->> 'messages')::numeric, 0))::int,
        'byChannel',         COALESCE(v_irc_by_chan,  '{}'::jsonb),
        'messagesByChannel', COALESCE(v_irc_msg_chan, '{}'::jsonb)
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
