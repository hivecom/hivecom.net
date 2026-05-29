-- Maintenance: table bloat / dead tuple ratio
-- Tables with significant dead-tuple buildup. High dead_pct = vacuum is falling behind.
-- Tables flagged > 20% dead with > 1000 dead rows are worth a manual VACUUM (FULL) or pg_repack.

SELECT
  schemaname || '.' || relname AS table,
  n_live_tup                   AS live_rows,
  n_dead_tup                   AS dead_rows,
  CASE
    WHEN n_live_tup + n_dead_tup = 0 THEN 0
    ELSE round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
  END                          AS dead_pct,
  last_autovacuum,
  last_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY dead_pct DESC, n_dead_tup DESC
LIMIT 25;
