# Supabase DB Triggers

Some Supabase schemas are protected and cannot be managed through the dashboard or migrations. Triggers in these schemas must be created manually via the SQL editor. The `public` schema triggers are managed by migrations and documented here for reference.

## Manual Triggers

These triggers live in protected schemas (`auth`, etc.) and must be created by hand. If you are setting up a new environment or the triggers are ever lost, recreate them using the SQL below.

### User Sign-up: Profile Creation

`on_auth_user_created` on `auth.users`

Fires `AFTER INSERT`. Creates a new row in `public.profiles` when a user registers.

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE handle_new_user();
```

### User Sign-up: Avatar Sync

`trigger_user_avatar_sync_insert` on `auth.users`

Fires `AFTER INSERT`. Copies the avatar URL from the OAuth provider metadata into `public.profiles` on initial sign-up.

```sql
CREATE TRIGGER trigger_user_avatar_sync_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_avatar_sync_from_auth();
```

### Sign-in: Avatar Refresh

`trigger_user_avatar_sync_signin` on `auth.users`

Fires `AFTER UPDATE`. Re-syncs the avatar from provider metadata on every sign-in, keeping it fresh if the user has updated their provider profile picture.

```sql
CREATE TRIGGER trigger_user_avatar_sync_signin
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_avatar_sync_from_auth();
```

### Sign-in: Last Seen Update

`on_auth_session_created` on `auth.sessions`

Fires `AFTER INSERT`. Updates `last_seen_at` on `public.profiles` whenever a new session is opened.

```sql
CREATE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_seen_on_session();
```

### Email Change: Discord Notification

`trigger_notify_discord_email_change` on `auth.users`

Fires `AFTER UPDATE`. Posts a Discord webhook when a user changes their email address.

```sql
CREATE TRIGGER trigger_notify_discord_email_change
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_email_change();
```

### Ban: Sync to Profile

`trigger_sync_profile_ban_from_auth` on `auth.users`

Fires `AFTER UPDATE`. Mirrors the ban state from `auth.users` to `public.profiles` when a user is banned or unbanned via the Supabase admin API.

```sql
CREATE TRIGGER trigger_sync_profile_ban_from_auth
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_ban_from_auth();
```

### Account Deletion: Discord Notification

`trigger_notify_discord_user_deleted` on `auth.users`

Fires `AFTER DELETE`. Posts a Discord webhook with the deleted user's email, ID, and deletion timestamp.

```sql
CREATE TRIGGER trigger_notify_discord_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_user_deleted();
```

## Migration-Managed Triggers

These triggers are defined in migrations and applied automatically. They are documented here for reference.

### Audit Fields

All auditable tables have a `BEFORE UPDATE` trigger that automatically maintains `modified_at` and `modified_by`, and protects `created_at` and `created_by` from being overwritten. This removes the need for application-level audit management.

Most tables use the shared `update_audit_fields()` function. The discussion tables use dedicated per-table variants to accommodate their custom audit logic.

| Table                      | Trigger                                        |
| -------------------------- | ---------------------------------------------- |
| `alerts`                   | `update_alerts_audit_fields`                   |
| `discussion_replies`       | `update_discussion_replies_audit_fields`       |
| `discussion_subscriptions` | `update_discussion_subscriptions_audit_fields` |
| `discussion_topics`        | `update_discussion_topics_audit_fields`        |
| `discussions`              | `update_discussions_audit_fields`              |
| `events`                   | `update_events_audit_fields`                   |
| `events_rsvps`             | `update_events_rsvps_audit_fields`             |
| `funding_expenses`         | `update_expenses_audit_fields`                 |
| `games`                    | `update_games_audit_fields`                    |
| `kvstore`                  | `update_kvstore_audit_fields`                  |
| `motds`                    | `update_motds_audit_fields`                    |
| `network_gameservers`      | `update_gameservers_audit_fields`              |
| `network_servers`          | `update_servers_audit_fields`                  |
| `profile_friends`          | `update_friends_audit_fields`                  |
| `profiles`                 | `update_profiles_audit_fields`                 |
| `projects`                 | `update_projects_audit_fields`                 |
| `referendum_votes`         | `update_referendum_votes_audit_fields`         |
| `referendums`              | `update_referendums_audit_fields`              |
| `user_notifications`       | `update_notifications_audit_fields`            |
| `user_settings`            | `update_settings_audit_fields`                 |

### `public.alerts`

#### Alert Acknowledged Fields

`fill_alert_acknowledged_fields_trigger`

Fires `BEFORE UPDATE`. Automatically populates `acknowledged_at` and `acknowledged_by` when an alert transitions to acknowledged.

### `public.complaints`

#### New Complaint: Discord Notification

`trigger_notify_discord_new_complaint`

Fires `AFTER INSERT`. Posts a Discord notification when a new complaint is submitted.

### `public.discussions`

#### Draft Rules Enforcement

`enforce_discussion_draft_rules_trigger`

Fires `BEFORE INSERT, UPDATE`. Enforces invariants on draft discussions, such as preventing publication while required fields are missing.

#### Mention Normalization

`normalize_mentions_on_discussions_markdown`

Fires `BEFORE INSERT, UPDATE`. Normalizes `@mention` syntax in the `markdown` field so stored mentions are in a canonical format.

#### Accepted Reply Validation

`validate_discussion_accepted_reply_trigger`

Fires `BEFORE INSERT, UPDATE`. Ensures `accepted_reply_id` belongs to a reply within this discussion.

#### Pinned Reply Validation

`validate_discussion_pinned_reply_trigger`

Fires `BEFORE INSERT, UPDATE`. Ensures `pinned_reply_id` belongs to a reply within this discussion.

#### Admin Field Protection

`protect_discussion_fields_trigger`

Fires `BEFORE UPDATE`. Prevents non-admins from modifying protected admin-only fields directly.

#### Reaction Column Protection

`protect_discussions_reactions`

Fires `BEFORE UPDATE`. Blocks direct writes to the `reactions` column - reactions must be mutated through the dedicated RPC functions.

#### Linked Discussion Delete Prevention

`prevent_deleting_linked_discussions_trigger`

Fires `BEFORE DELETE`. Prevents a discussion from being deleted if it is the linked discussion of an entity (event, project, etc.). The entity row must be deleted first, which cascades.

#### Author Auto-Subscribe

`auto_subscribe_discussion_author_trigger`

Fires `AFTER INSERT`. Subscribes the discussion author to their own discussion so they receive reply notifications.

#### NSFW Cascade to Replies

`cascade_discussion_nsfw_to_replies_trigger`

Fires `AFTER UPDATE`. Propagates `is_nsfw` changes to all replies in the discussion.

#### Forum Reply Flag Sync

`sync_replies_is_forum_reply_trigger`

Fires `AFTER UPDATE`. Propagates `is_forum_reply` to all replies when the discussion's topic assignment changes.

#### Topic Aggregate Count Maintenance

`update_topic_aggregate_counts_trigger`

Fires `AFTER INSERT, UPDATE, DELETE`. Keeps the discussion and reply count aggregates on `discussion_topics` in sync.

#### Topic Last Activity Update

`update_topic_last_activity_trigger`

Fires `AFTER INSERT, UPDATE, DELETE`. Updates `last_activity_at` on the parent `discussion_topics` row.

#### Hard Delete: Media Cleanup

`cleanup_discussion_media_on_hard_delete_trigger`

Fires `AFTER DELETE`. Reads `OLD.markdown` and asynchronously calls `/functions/v1/trigger-cleanup-discussion-media` to remove any orphaned media from the `hivecom-content-forums` storage bucket. Covers both direct admin deletes and CASCADE deletes triggered by the parent entity being removed.

See [README_ARCHITECTURE.md](README_ARCHITECTURE.md) for details on the media cleanup system.

### `public.discussion_replies`

#### NSFW Inheritance on Insert

`inherit_discussion_nsfw_on_reply_insert_trigger`

Fires `BEFORE INSERT`. Sets `is_nsfw` on the new reply to match its parent discussion.

#### Off-topic Inheritance on Insert

`inherit_reply_offtopic_on_insert_trigger`

Fires `BEFORE INSERT`. Sets `is_offtopic` on the new reply based on the parent discussion and thread state.

#### Draft Discussion Reply Prevention

`prevent_replies_on_draft_discussion_trigger`

Fires `BEFORE INSERT, UPDATE`. Raises an error when a reply is posted to - or undeleted in - a draft discussion.

#### Author Content Protection

`protect_reply_content_from_non_author_trigger`

Fires `BEFORE UPDATE`. Prevents users other than the reply author (and admins) from modifying content fields.

#### Off-topic Field Protection

`protect_reply_offtopic_field_trigger`

Fires `BEFORE UPDATE`. Prevents non-admins from directly setting `is_offtopic`.

#### Reaction Column Protection

`protect_discussion_replies_reactions`

Fires `BEFORE UPDATE`. Blocks direct writes to the `reactions` column - same pattern as on `discussions`.

#### Mention Normalization

`normalize_mentions_on_discussion_replies_markdown`

Fires `BEFORE INSERT, UPDATE`. Normalizes `@mention` syntax in reply `markdown`.

#### Forum Reply Flag on Insert

`set_reply_is_forum_reply_trigger`

Fires `BEFORE INSERT`. Sets `is_forum_reply` based on whether the parent discussion belongs to a forum topic.

#### Soft Delete: Content Scrub

`scrub_discussion_reply_on_soft_delete_trigger`

Fires `BEFORE UPDATE OF is_deleted`. Wipes the reply's content fields when it is soft-deleted.

#### Soft Delete: Media Cleanup

`cleanup_reply_media_on_soft_delete_trigger`

Fires `BEFORE UPDATE OF is_deleted`. Reads `OLD.markdown` before `scrub_discussion_reply_on_soft_delete_trigger` wipes it, then fires the media cleanup edge function asynchronously. Alphabetical trigger naming guarantees this runs first.

#### Hard Delete: Media Cleanup

`cleanup_reply_media_on_hard_delete_trigger`

Fires `AFTER DELETE`. Reads `OLD.markdown` and fires media cleanup for hard-deleted replies. Skips rows that were already soft-deleted (their markdown was already wiped). Covers admin force-deletes and CASCADE deletes from parent entity rows.

#### Off-topic Cascade to Children

`cascade_reply_offtopic_trigger`

Fires `AFTER UPDATE`. Propagates `is_offtopic` changes from a parent reply down to its children.

#### Pinned Reply Clearance on Delete

`clear_pinned_reply_on_delete_trigger`

Fires `AFTER UPDATE, DELETE`. Clears `pinned_reply_id` on the parent discussion if the pinned reply is deleted or soft-deleted.

#### Discussion Last Activity Update

`update_discussion_last_activity_trigger`

Fires `AFTER INSERT, DELETE`. Updates `last_activity_at` on the parent discussion row.

#### Reply Count Maintenance

`update_discussion_reply_count_trigger`

Fires `AFTER INSERT, UPDATE, DELETE`. Keeps the `reply_count` aggregate on the parent discussion in sync.

#### New Reply: Subscriber Notifications

`notify_discussion_subscribers_on_reply`

Fires `AFTER INSERT`. Creates in-app notifications for all subscribers of the discussion when a new, non-deleted reply is posted.

#### New Reply: Mention Notifications

`notify_mentioned_users_on_reply`

Fires `AFTER INSERT`. Creates in-app notifications for any users `@mentioned` in the reply.

#### New Reply: Reply-to-Reply Author Notification

`notify_reply_to_reply_author_on_reply`

Fires `AFTER INSERT`. Creates an in-app notification for the author of the reply being directly responded to.

All three media cleanup triggers call `/functions/v1/trigger-cleanup-discussion-media` via `net.http_post` and are non-blocking.

**Required Vault secrets:** `project_url`, `anon_key`, `system_trigger_secret`

### `public.discussion_topics`

#### Topic Cycle Prevention

`discussion_topics_prevent_cycles`

Fires `BEFORE INSERT, UPDATE`. Prevents circular parent-child references in the topic hierarchy.

### `public.events`

#### Linked Discussion Creation

`create_discussion_on_event`

Fires `AFTER INSERT`. Creates a linked discussion for the event via `create_discussion_for_entity('event_id', 'events')`.

#### Mention Normalization

`normalize_mentions_on_events_markdown`

Fires `BEFORE INSERT, UPDATE`. Normalizes `@mention` syntax in event `markdown`.

#### Linked Discussion Metadata Sync

`sync_discussion_on_event_update`

Fires `AFTER UPDATE`. Propagates event metadata changes (title, visibility, etc.) to the linked discussion row.

#### Linked Discussion Markdown Sync

`sync_discussion_markdown_on_event_update`

Fires `AFTER UPDATE`. Propagates changes to the event's `markdown` body into the linked discussion.

#### Date Change: RSVP Reset

`reset_event_rsvps_on_date_change_trigger`

Fires `AFTER UPDATE`. Clears all RSVPs and notifies attendees when the event's scheduled date changes.

#### Google Calendar Sync

`trigger_sync_google_calendar_insert` / `_update` / `_delete`

Fire `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` respectively. Call `/functions/v1/trigger-google-calendar-sync` to mirror the event to Google Calendar. The update trigger is column-scoped to avoid unnecessary calls; the delete trigger passes the stored `google_event_id` so the remote event can be removed even after the row is gone.

#### Discord Event Sync

`trigger_sync_discord_events_insert` / `_update` / `_delete`

Fire `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` respectively. Call `/functions/v1/trigger-discord-event-sync` to manage the corresponding Discord scheduled event. Updates are column-scoped to avoid feedback loops; the delete trigger only fires when a `discord_event_id` exists.

Both trigger groups use vault-stored `project_url`, `anon_key`, and `system_trigger_secret` for the async `net.http_post` calls. See [README_ARCHITECTURE.md](README_ARCHITECTURE.md) for a broader description of the event sync system.

### `public.funding_history`

#### Ko-fi Donation: Discord Notification

`trigger_notify_discord_kofi_donation`

Fires `AFTER INSERT, UPDATE`. Posts a Discord notification when a Ko-fi donation record is created or updated.

### `public.network_gameservers`

#### Linked Discussion Creation

`create_discussion_on_gameserver`

Fires `AFTER INSERT`. Creates a linked discussion for the gameserver via `create_discussion_for_entity('gameserver_id', 'null')`.

#### Mention Normalization

`normalize_mentions_on_gameservers_markdown`

Fires `BEFORE INSERT, UPDATE`. Normalizes `@mention` syntax in gameserver `markdown`.

#### Linked Discussion Metadata Sync

`sync_discussion_on_gameserver_update`

Fires `AFTER UPDATE`. Propagates gameserver metadata changes to the linked discussion.

#### Linked Discussion Markdown Sync

`sync_discussion_markdown_on_gameserver_update`

Fires `AFTER UPDATE`. Propagates changes to the gameserver's `markdown` body into the linked discussion.

### `public.presences_steam`

#### Game Catalog Upsert

`on_steam_presence_upsert_game`

Fires `AFTER INSERT, UPDATE`. Upserts a row in `public.data_steam_games` via `trigger_upsert_data_steam_game()`, keeping the game catalog current whenever Steam presence data is written.

### `public.profiles`

#### Linked Discussion Creation

`create_discussion_on_profile`

Fires `AFTER INSERT`. Creates a profile wall discussion via `create_discussion_for_entity('profile_id', 'null')`.

#### Mention Normalization

`normalize_mentions_on_profiles_markdown`

Fires `BEFORE INSERT, UPDATE`. Normalizes `@mention` syntax in the profile `markdown` bio field.

#### Username Regression Prevention

`prevent_username_set_regression`

Fires `BEFORE UPDATE`. Prevents a username from being cleared once it has been set.

#### Steam Unlink: Presence Cleanup

`on_steam_id_unlink`

Fires `AFTER UPDATE OF steam_id`. Deletes the corresponding `presences_steam` row when `steam_id` transitions from a non-null value to null, preventing stale presence data from affecting metrics.

#### Theme Change: Usage Count Refresh

`on_profile_theme_changed`

Fires `AFTER INSERT, UPDATE, DELETE` at statement level. Refreshes the `usage_count` aggregate on `themes` whenever a profile's theme assignment changes.

#### Profile Delete: Reply Soft-Delete

`soft_delete_replies_on_profile_delete_trigger`

Fires `BEFORE DELETE`. Soft-deletes all discussion replies authored by the profile before the profile row is removed, preserving thread structure.

#### Linked Discussion Metadata Sync

`sync_discussion_on_profile_update`

Fires `AFTER UPDATE`. Propagates profile metadata changes to the linked profile wall discussion.

#### Ban Status Change: Discord Notification

`trigger_notify_discord_ban_status_changed`

Fires `AFTER UPDATE`. Posts a Discord notification when a profile's ban status changes.

#### Supporter Status Change: Discord Notification

`trigger_notify_discord_supporter_status_changed`

Fires `AFTER UPDATE`. Posts a Discord notification when a profile's supporter status changes.

#### Username Change: Discord Notification

`trigger_notify_discord_username_changed`

Fires `AFTER UPDATE`. Posts a Discord notification when a profile's username changes.

### `public.projects`

#### Linked Discussion Creation

`create_discussion_on_project`

Fires `AFTER INSERT`. Creates a linked discussion for the project via `create_discussion_for_entity('project_id', 'projects')`.

#### Mention Normalization

`normalize_mentions_on_projects_markdown`

Fires `BEFORE INSERT, UPDATE`. Normalizes `@mention` syntax in project `markdown`.

#### Linked Discussion Metadata Sync

`sync_discussion_on_project_update`

Fires `AFTER UPDATE`. Propagates project metadata changes to the linked discussion.

#### Linked Discussion Markdown Sync

`sync_discussion_markdown_on_project_update`

Fires `AFTER UPDATE`. Propagates changes to the project's `markdown` body into the linked discussion.

### `public.referendums`

#### Linked Discussion Creation

`create_discussion_on_referendum`

Fires `AFTER INSERT`. Creates a linked discussion for the referendum via `create_discussion_for_entity('referendum_id', 'referendums')`.

#### Vote Cleanup on Choice Removal

`referendum_choices_removal_trigger`

Fires `AFTER UPDATE`. Deletes existing votes for any choices that were removed from the referendum's choices array.

### `public.themes`

#### Linked Discussion Creation

`create_discussion_on_theme`

Fires `AFTER INSERT`. Creates a linked discussion for the theme via `create_discussion_for_entity('theme_id', 'null')`.

#### Custom CSS Sanitization

`sanitize_theme_custom_css`

Fires `BEFORE INSERT, UPDATE`. Strips dangerous or disallowed rules from the `custom_css` field before the row is persisted.

#### Owner Deletion Handling

`on_theme_owner_deleted`

Fires `BEFORE UPDATE`. Handles ownership nullification or transfer when a theme's owner profile is deleted.
