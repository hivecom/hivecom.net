-- Stability: metrics retention health
-- Daily count of raw vs aggregated metric snapshots around the 90-day rollup boundary.
-- Shows 5 days either side of the cutoff so you can confirm raw rows stop and
-- aggregated rows (exactly 1 per day) appear at the boundary.
-- cron_metrics_daily_rollup runs daily at 04:00 UTC.
-- If raw rows persist beyond 90 days, or aggregated rows are missing, the rollup cron is broken.
-- total_rows is the chart Y axis.

SELECT
  date_trunc('day', captured_at)::date                          AS day,
  count(*) FILTER (WHERE is_aggregated = FALSE)                 AS raw_snapshots,
  count(*) FILTER (WHERE is_aggregated = TRUE)                  AS aggregated_snapshots,
  count(*)                                                      AS total_rows
FROM public.metrics
WHERE captured_at BETWEEN (now() - interval '95 days') AND (now() - interval '85 days')
GROUP BY 1
ORDER BY 1 DESC;
