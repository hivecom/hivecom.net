# Architecture

This document describes cross-cutting systems and background architectures that span multiple tables, edge functions, and cron jobs. For individual triggers see [README_TRIGGERS.md](README_TRIGGERS.md), for cron jobs see [README_CRON.md](README_CRON.md), and for runtime configuration see [README_KVSTORE.md](README_KVSTORE.md).

## RBAC

Hivecom uses Supabase's RBAC setup with auth hooks to inject custom claims into JWT tokens on sign-in. This allows the front-end to read role and permission data directly from the session token without an extra database round-trip on every request.

See the [official Supabase RBAC guide](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac?queryGroups=language&language=plpgsql) for the underlying mechanism.

## Entity-Linked Discussions

Every major content entity - profiles, events, gameservers, projects, referendums, and themes - automatically gets a linked discussion when it is created. This is handled by the shared `create_discussion_for_entity(foreign_key_column, visibility_source_table)` trigger function, called from a dedicated `AFTER INSERT` trigger on each entity table.

The linked discussion mirrors the entity's `title`, `markdown`, visibility, and NSFW state. Subsequent updates to these fields are propagated in both directions:

- `sync_discussion_from_entity(foreign_key_column)` keeps the discussion's metadata in sync when the entity is updated.
- `sync_discussion_markdown_from_entity(foreign_key_column)` keeps the discussion's `markdown` body in sync separately (scoped to the markdown column to avoid unnecessary full-row syncs).

Linked discussions cannot be deleted directly - the `prevent_deleting_linked_discussions_trigger` blocks it. They are only removed via CASCADE when the parent entity is deleted.

## Discussion Media Cleanup

When a discussion or reply is deleted (or soft-deleted), any media files referenced in its markdown are removed from the `hivecom-content-forums` storage bucket. This is handled by asynchronous calls to the `/functions/v1/trigger-cleanup-discussion-media` edge function via `net.http_post`, so it never blocks the triggering transaction.

All deletion paths are covered:

- **Reply soft-delete:** `cleanup_reply_media_on_soft_delete_trigger` fires `BEFORE UPDATE OF is_deleted` and reads `OLD.markdown` before `scrub_discussion_reply_on_soft_delete_trigger` wipes it. Alphabetical trigger naming guarantees the cleanup fires first.
- **Reply hard-delete:** `cleanup_reply_media_on_hard_delete_trigger` fires `AFTER DELETE`. Skips rows that were already soft-deleted since their markdown was already wiped (and their media already cleaned up).
- **Discussion hard-delete:** `cleanup_discussion_media_on_hard_delete_trigger` fires `AFTER DELETE`. Discussions have no soft-delete mechanism, so this covers all discussion deletions - both direct admin deletes and CASCADE deletes from parent entity rows.

**Required Vault secrets:** `project_url`, `anon_key`, `system_trigger_secret`

## Event External Sync (Google Calendar + Discord)

When community events are created, updated, or deleted, they are mirrored to Google Calendar and Discord Scheduled Events via trigger-backed edge function calls.

### Google Calendar

Three triggers on `public.events` call `/functions/v1/trigger-google-calendar-sync`:

- `trigger_sync_google_calendar_insert` on `AFTER INSERT`
- `trigger_sync_google_calendar_update` on `AFTER UPDATE` (column-scoped to relevant fields)
- `trigger_sync_google_calendar_delete` on `AFTER DELETE` - passes the stored `google_event_id` so the remote event can be removed even after the local row is gone

### Discord

Three triggers on `public.events` call `/functions/v1/trigger-discord-event-sync`:

- `trigger_sync_discord_events_insert` on `AFTER INSERT`
- `trigger_sync_discord_events_update` on `AFTER UPDATE` (column-scoped to avoid feedback loops)
- `trigger_sync_discord_events_delete` on `AFTER DELETE` - only fires when a `discord_event_id` exists on the row

Both groups use vault-stored `project_url`, `anon_key`, and `system_trigger_secret` for the async `net.http_post` calls. Neither blocks the originating transaction.

**Required Vault secrets:** `project_url`, `anon_key`, `system_trigger_secret`

## Steam Identity Sync (Background Queue)

Steam presence data is kept current via a scalable background queue architecture rather than a direct cron-to-edge-function pattern. This allows the workload to be spread across many concurrent short-lived workers.

**Flow:** `pg_cron` enqueuer → `queue_sync_steam` (PGMQ) → dispatcher → `worker-sync-steam` edge functions

### Producer: `queue_enqueue_sync_steam`

Runs every 5 minutes. Calls `private.queue_enqueue_worker_sync_steam()`, which enqueues one message per profile that has both `steam_id` set and `rich_presence_enabled`.

### Dispatcher: `queue_dispatch_sync_steam`

Runs every minute. Calls `private.queue_dispatch_worker_sync_steam()`, which:

1. Reads runtime configuration from `private.kvstore` under key `worker_sync_steam`
2. Checks queue depth via `pgmq.metrics('queue_sync_steam')`
3. Calculates the number of workers needed based on queue depth, batch size, and max concurrency
4. Fires the appropriate number of `worker-sync-steam` edge function invocations via `net.http_post`

See [README_KVSTORE.md](README_KVSTORE.md) for the full dispatcher configuration reference, and [README_CRON.md](README_CRON.md) for the cron job schedules.

**Required Vault secrets:** `project_url`, `anon_key`, `system_cron_secret`

**Required environment variables:** `STEAM_API_KEY`
