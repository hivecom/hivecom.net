-- Perf: unused indexes
-- Indexes that have never been scanned since the last stats reset.
-- These cost write performance and disk for no read benefit. Consider dropping.
-- Excludes primary keys and unique constraints (needed for correctness).

SELECT
  s.schemaname || '.' || s.relname        AS table,
  s.indexrelname                           AS index,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
  round((pg_relation_size(s.indexrelid) / 1024.0 / 1024.0)::numeric, 2) AS size_mb,
  s.idx_scan                              AS scans
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
  AND s.schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size(s.indexrelid) DESC;
