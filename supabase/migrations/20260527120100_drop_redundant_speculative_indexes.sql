-- Drop redundant and speculative indexes with no active query patterns.
--
-- Presence profile_id indexes: covered by UNIQUE constraints or PKs.
-- Presence status/activity/app/channel indexes: no query patterns use them.
-- event_rsvps audit column indexes: no query patterns use created_by/modified_by.
-- user_notifications audit column indexes: system-generated rows, never queried by these columns.

-- presences_discord: profile_id covered by UNIQUE(profile_id)
DROP INDEX IF EXISTS presences_discord_profile_id_idx;

-- presences_steam: profile_id covered by UNIQUE(profile_id)
DROP INDEX IF EXISTS presences_steam_profile_id_idx;

-- presences_lastfm: profile_id is the PK
DROP INDEX IF EXISTS presences_lastfm_profile_id_idx;

-- presences_discord: speculative status/activity indexes
DROP INDEX IF EXISTS presences_discord_status_idx;
DROP INDEX IF EXISTS presences_discord_activity_name_idx;

-- presences_steam: speculative status/app indexes
DROP INDEX IF EXISTS presences_steam_status_idx;
DROP INDEX IF EXISTS presences_steam_last_app_id_idx;

-- presences_teamspeak: speculative channel_id index
DROP INDEX IF EXISTS presences_teamspeak_channel_id_idx;

-- event_rsvps: audit column indexes with no query patterns
DROP INDEX IF EXISTS idx_event_rsvps_created_by;
DROP INDEX IF EXISTS idx_event_rsvps_modified_by;

-- user_notifications: audit column indexes with no query patterns
DROP INDEX IF EXISTS idx_user_notifications_created_by;
DROP INDEX IF EXISTS idx_user_notifications_modified_by;
