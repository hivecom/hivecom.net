# KV Store

There are two KV stores in the database, serving different purposes:

- **`public.kvstore`** - Admin-tunable configuration exposed via the public API. Values here are readable and writable by admins from the front-end and are typically used to control application behaviour like point award rates and possibly other things such as quick front-end A/B tests.
- **`private.kvstore`** - Internal configuration not accessible via the public API. Values here are read by database functions at call time, so changes take effect immediately without a deployment or migration.

Both tables store values as JSONB and have standard audit fields.

## `public.kvstore`

### `points_per_cent`

The rate at which euro cents are converted into points when processing donations. Used by the Ko-fi webhook (`/functions/v1/webhook-kofi-donation`) and the Patreon cron (`/functions/v1/cron-patreon-fetch`) when calculating point awards from supporter payments.

| Type   | Default |
| ------ | ------- |
| number | `1`     |

### `points_per_month_loyalty`

Points awarded to active profiles each month by `public.cron_points_loyalty_award()`. A profile qualifies if it has been seen within the last 30 days. Set to `0` to disable.

| Type   | Default |
| ------ | ------- |
| number | `50`    |

### `points_per_birthday`

Points awarded to a profile on their birthday by `public.cron_points_birthday_award()`.

| Type   | Default |
| ------ | ------- |
| number | `1000`  |

## `private.kvstore`

### `worker_sync_steam`

Configuration for the Steam identity sync background queue dispatcher. Read by `private.queue_dispatch_worker_sync_steam()` on every invocation.

```json
{
  "max_wall_clock_ms": 140000,
  "batch_size": 100,
  "visibility_timeout_sec": 60,
  "max_concurrency": 20
}
```

| Key                      | Type    | Description                                                                                                                                           |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max_wall_clock_ms`      | integer | Maximum runtime budget per worker in milliseconds. Set to 140,000 to stay within the 150s Supabase Free Plan edge function limit.                     |
| `batch_size`             | integer | Number of queue messages popped per worker invocation. Set to 100 to match the Steam `GetPlayerSummaries` API limit - exactly one API call per batch. |
| `visibility_timeout_sec` | integer | How long a popped message stays hidden from other consumers. If a worker crashes, its messages reappear after this window for reprocessing.           |
| `max_concurrency`        | integer | Maximum number of `worker-sync-steam` edge function invocations running simultaneously.                                                               |

See [README_ARCHITECTURE.md](README_ARCHITECTURE.md) for the full Steam sync queue design, and [README_CRON.md](README_CRON.md) for the associated cron jobs.
