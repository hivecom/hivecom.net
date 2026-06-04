-- Perf: slowest queries (top 25 by total time)
-- From pg_stat_statements. Identify hot/slow SQL paths. mean_exec_ms is the chart-friendly column.
-- Filters out admin/internal noise.

SELECT
  substring(regexp_replace(query, '\s+', ' ', 'g') FOR 120) AS query,
  calls,
  round((total_exec_time / 1000.0)::numeric, 2)  AS total_sec,
  round(mean_exec_time::numeric, 2)               AS mean_exec_ms,
  round(max_exec_time::numeric, 2)                AS max_exec_ms,
  rows
FROM extensions.pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query NOT ILIKE '%pg_stat_statements%'
  AND query NOT ILIKE '%pg_catalog.%'
ORDER BY total_exec_time DESC
LIMIT 25;
