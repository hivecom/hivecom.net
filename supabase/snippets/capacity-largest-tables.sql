-- Capacity: largest tables on disk (top 25)
-- Total size (table + indexes + TOAST) per relation. total_mb is chart-friendly.
-- Use this to spot runaway growth and prioritize partitioning/archival.

SELECT
  n.nspname || '.' || c.relname                                               AS table,
  c.reltuples::bigint                                                          AS approx_rows,
  pg_size_pretty(pg_total_relation_size(c.oid))                               AS total_size,
  pg_size_pretty(pg_relation_size(c.oid))                                     AS table_size,
  pg_size_pretty(pg_indexes_size(c.oid))                                      AS indexes_size,
  round((pg_total_relation_size(c.oid) / 1024.0 / 1024.0)::numeric, 1)       AS total_mb
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 25;
