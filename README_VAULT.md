# Vault Secrets

Supabase Vault is used to store secrets that need to be accessible from within the database - primarily for trigger functions that make outbound HTTP calls via `net.http_post` without exposing credentials in plain SQL. This means the database can invoke edge functions as itself without ever embedding a service role key in SQL. Secrets stored here are read by database functions using `vault.decrypted_secrets`.

Edge functions access their credentials through Deno environment variables (Supabase project secrets), **not** through Vault. Vault is purely for the database layer. When adding a new cron or trigger-backed edge function, make sure the corresponding secret (`system_cron_secret` or `system_trigger_secret`) is also added to the function's environment in the Supabase dashboard under **Edge Functions > your function > Secrets**. The helper functions in `supabase/functions/_shared/auth.ts` (`authorizeSystemCron()` and `authorizeSystemTrigger()`) handle validation on the function side.

To add or update a Vault secret, use the Supabase dashboard under **Database > Vault**, or via the CLI.

## `anon_key`

The project's anon (publishable) API key. Used by database trigger functions when constructing the `Authorization` header for outbound edge function calls (`net.http_post`). This allows triggers to invoke edge functions without embedding a service role key in SQL.

**Used by:** all trigger and cron functions that call edge functions from within the database.

## `project_url`

The Supabase project URL (e.g. `https://<ref>.supabase.co`). Used alongside `anon_key` to construct the full edge function URL in trigger and cron SQL functions.

**Used by:** all trigger and cron functions that call edge functions from within the database.

## `system_cron_secret`

A shared secret sent as the `System-Cron-Secret` HTTP header by cron SQL functions when invoking edge functions. Edge functions call `authorizeSystemCron()` to validate it. Prevents arbitrary external callers from triggering cron-only endpoints.

**Used by:** `cron-docker-control-container-fetch`, `cron-metrics-fetch`, `cron-patreon-fetch`, `cron-teamspeak-sync`, `queue_dispatch_sync_steam` (via `worker-sync-steam`).

## `system_trigger_secret`

A shared secret sent as the `System-Trigger-Secret` HTTP header by trigger SQL functions when invoking edge functions. Edge functions call `authorizeSystemTrigger()` to validate it. Prevents arbitrary external callers from triggering trigger-only endpoints.

**Used by:** `trigger-cleanup-discussion-media`, `trigger-discord-event-sync`, `trigger-google-calendar-sync`.

## `system_discord_notification_webhook_url`

The incoming webhook URL for the Discord channel that receives system notifications. Read directly by database notification functions (e.g. `notify_discord_new_signup`, `notify_discord_user_deleted`, `trigger_notify_discord_ban_status_changed`, etc.) to post messages without routing through an edge function.

**Used by:** all `notify_discord_*` and `trigger_notify_discord_*` database functions.
