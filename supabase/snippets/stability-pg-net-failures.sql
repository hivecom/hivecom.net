-- Stability: pg_net HTTP request failures (last 24h)
-- Outbound calls from triggers / edge function invocations that failed or returned non-2xx.
-- Critical for verifying webhook delivery (Discord notifications, etc.).

SELECT
  date_trunc('hour', r.created)::timestamptz AS hour,
  q.method,
  substring(q.url FOR 80)                    AS url,
  r.status_code,
  count(*)                                   AS requests
FROM net._http_response r
JOIN net.http_request_queue q ON q.id = r.id
WHERE r.created >= now() - interval '24 hours'
  AND (r.status_code IS NULL OR r.status_code >= 400)
GROUP BY 1, 2, 3, 4
ORDER BY hour DESC, requests DESC;
