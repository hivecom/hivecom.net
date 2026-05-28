# Cron Jobs

Scheduled jobs are managed via `pg_cron`, which lets us run periodic tasks directly from the database without needing an external scheduler or service. The job definitions and their invocation functions are created automatically by migrations, so there is nothing to manually register when setting up a new environment.

Jobs that call edge functions authenticate using vault-stored `anon_key` and `system_cron_secret` - see [README_VAULT.md](README_VAULT.md) for how those secrets work and where to set them up.

The two Steam sync jobs (`queue_enqueue_sync_steam`, `queue_dispatch_sync_steam`) are part of a more complex background queue architecture - see [README_ARCHITECTURE.md](README_ARCHITECTURE.md) for the full design.

## `cron-docker-control-container-fetch`

**Schedule:** `30 * * * *` (every hour at :30)

Fetches the current state of all managed Docker containers and persists it to the database. Allows the admin panel to display live container status without polling on demand.

**Edge function:** `/functions/v1/cron-docker-control-container-fetch`

**Required environment variables:** `DOCKER_CONTROL_TOKEN`

## `cron-metrics-fetch`

**Schedule:** `*/5 * * * *` (every 5 minutes)

Collects current metrics from all tracked servers and gameservers and writes snapshots to the metrics tables. Raw snapshots are later rolled up into daily aggregates by `cron-metrics-rollup`.

**Edge function:** `/functions/v1/cron-metrics-fetch`

## `cron-metrics-rollup`

**Schedule:** `0 4 * * *` (daily at 04:00 UTC)

Aggregates the previous day's raw metric snapshots into daily summary rows via `public.cron_metrics_daily_rollup()`. Runs in-database with no edge function.

## `cron-patreon-fetch`

**Schedule:** `0 0 * * *` (daily at 00:00 UTC)

Fetches all current Patreon campaign members and reconciles their supporter status in `public.profiles`. Designed to avoid spurious `supporter_patreon` flip-flops that would otherwise trigger daily Discord notifications for active supporters.

**Edge function:** `/functions/v1/cron-patreon-fetch`

**Required environment variables:** `PATREON_ACCESS_TOKEN`, `PATREON_CAMPAIGN_ID`, `PATREON_CAMPAIGN_SUPPORTER_TIER_ID`

## `cron-points-birthday-award`

**Schedule:** `0 1 * * *` (daily at 01:00 UTC)

Awards birthday loyalty points to any profiles whose birthday falls on the current day, via `public.cron_points_birthday_award()`. Runs in-database with no edge function.

## `cron-points-loyalty-award`

**Schedule:** `0 0 1 * *` (monthly on the 1st at 00:00 UTC)

Awards monthly loyalty points to all eligible profiles via `public.cron_points_loyalty_award()`. Runs in-database with no edge function.

## `cron-teamspeak-sync`

**Schedule:** `*/15 * * * *` (every 15 minutes)

Connects to all configured TeamSpeak servers, reads current client presence, and syncs group assignments for linked profiles. Also writes a state snapshot to the `hivecom-content-static` storage bucket for the TeamSpeak viewer widget.

**Edge function:** `/functions/v1/cron-teamspeak-sync`

**Required environment variables:** `TEAMSPEAK_QUERY_USERNAMES`, `TEAMSPEAK_QUERY_PASSWORDS`

## `queue_enqueue_sync_steam`

**Schedule:** `*/5 * * * *` (every 5 minutes)

Runs `private.queue_enqueue_worker_sync_steam()`, which enqueues one PGMQ message per profile that has both `steam_id` set and `rich_presence_enabled`. Part of the Steam identity sync queue system.

## `queue_dispatch_sync_steam`

**Schedule:** `* * * * *` (every minute)

Runs `private.queue_dispatch_worker_sync_steam()`, which checks queue depth and fires the appropriate number of `worker-sync-steam` edge function invocations. Part of the Steam identity sync queue system.
