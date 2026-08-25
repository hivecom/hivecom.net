-- Stability: pg_net HTTP request failures
-- Outbound calls from triggers / edge function invocations that failed, timed
-- out, or returned non-2xx. Critical for verifying webhook delivery (Discord
-- notifications, etc.) and cron/worker edge invocations.
-- No rows = all recent pg_net calls succeeded.
--
-- Don't join net.http_request_queue for URLs: pg_net deletes queue rows the
-- moment a request completes, so the join drops every finished response. That
-- hid a week of 401s during the Aug 2026 legacy-key outage. Completed
-- responses only carry status/error, no URL or method.
--
-- pg_net also prunes responses after ~6 hours, so that's the real window here
-- regardless of the filter.

SELECT
  date_trunc('hour', r.created)::timestamptz AS hour,
  r.status_code,
  r.timed_out,
  substring(r.error_msg FOR 80)              AS error,
  substring(r.content FOR 80)                AS response_body,
  count(*)                                   AS requests
FROM net._http_response r
WHERE r.created >= now() - interval '6 hours'
  AND (r.status_code IS NULL OR r.status_code >= 400 OR r.timed_out OR r.error_msg IS NOT NULL)
GROUP BY 1, 2, 3, 4, 5
ORDER BY hour DESC, requests DESC;
