-- Stability: pg_cron job health
-- Jobs with a 'failed' last_status or at least one failure in the last 24 hours.
-- No rows = all jobs healthy.

WITH last_runs AS (
  SELECT DISTINCT ON (jobid)
    jobid,
    start_time  AS last_run_at,
    status      AS last_status,
    return_message
  FROM cron.job_run_details
  ORDER BY jobid, start_time DESC
),
failure_counts AS (
  SELECT
    jobid,
    count(*) AS failures_24h
  FROM cron.job_run_details
  WHERE start_time >= now() - interval '24 hours'
    AND status = 'failed'
  GROUP BY jobid
)
SELECT
  j.jobname,
  j.schedule,
  j.active,
  lr.last_run_at,
  lr.last_status,
  coalesce(fc.failures_24h, 0) AS failures_24h,
  lr.return_message
FROM cron.job j
LEFT JOIN last_runs     lr ON lr.jobid = j.jobid
LEFT JOIN failure_counts fc ON fc.jobid = j.jobid
WHERE lr.last_status = 'failed'
   OR coalesce(fc.failures_24h, 0) > 0
ORDER BY coalesce(fc.failures_24h, 0) DESC, lr.last_run_at DESC NULLS LAST;
