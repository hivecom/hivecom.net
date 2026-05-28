-- ============================================================
-- 1. Trigger functions: revoke EXECUTE from anon + authenticated
--    (they are only ever called by trigger machinery)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.create_discussion_for_entity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_discussion_from_entity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_discussion_markdown_from_entity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.normalize_mentions_on_discussion_reply() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.normalize_mentions_on_markdown() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_auto_subscribe_discussion_author() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_cascade_reply_offtopic() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_cascade_discussion_nsfw_to_replies() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_cleanup_discussion_media_on_hard_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_cleanup_reply_media_on_hard_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_cleanup_reply_media_on_soft_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_clear_pinned_reply_on_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_delete_steam_presence_on_unlink() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_enforce_discussion_draft_rules() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_fill_alert_acknowledged_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_handle_theme_owner_deleted() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_inherit_discussion_nsfw_on_reply_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_inherit_reply_offtopic_on_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_and_reset_event_rsvps_on_date_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_discord_ban_status_changed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_discord_new_complaint() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_discord_supporter_status_changed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_discord_username_changed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_discussion_subscribers() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_mentioned_users() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_reply_to_reply_author() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_prevent_deleting_linked_discussions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_prevent_discussion_topic_cycles() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_prevent_replies_on_draft_discussion() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_prevent_username_set_regression() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_protect_discussion_admin_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_protect_reactions_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_protect_reply_content_from_non_author() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_protect_reply_offtopic_field() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_refresh_theme_usage() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sanitize_theme_custom_css() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_scrub_discussion_reply_on_soft_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_set_reply_is_forum_reply() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_soft_delete_replies_on_profile_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_discord_events_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_discord_events_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_discord_events_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_google_calendar_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_google_calendar_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_google_calendar_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_discussion_last_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_discussion_replies_audit_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_discussion_reply_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_discussion_topics_audit_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_discussions_audit_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_topic_aggregate_counts() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_update_topic_last_activity() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_upsert_data_steam_game() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_user_avatar_sync_from_auth() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_validate_discussion_accepted_reply() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_validate_discussion_pinned_reply() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trigger_delete_votes_on_choices_removal() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_audit_fields() FROM anon, authenticated, public;

-- handle_new_user: auth hook, never called directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- notify_discord_*: trigger-driven notification functions
REVOKE EXECUTE ON FUNCTION public.notify_discord_email_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_discord_new_signup() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_discord_user_deleted() FROM anon, authenticated, public;

-- sync_profile_ban_from_auth: trigger function
REVOKE EXECUTE ON FUNCTION public.sync_profile_ban_from_auth() FROM anon, authenticated, public;

-- ============================================================
-- 2. Backend-only / admin RPCs: revoke from anon only
--    (authenticated is needed since they check permissions)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.cron_metrics_daily_rollup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cron_points_birthday_award() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cron_points_loyalty_award() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user_sessions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_complaints_paginated(text, text[], text[], integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_discussions_paginated(text, text[], text[], uuid, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_discussions_paginated(text, text[], text[], text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_events_paginated(text, text, text, integer, integer, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_referendums_paginated(text, text[], text[], text[], text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_themes_paginated(text, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_countries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_users_paginated(text, text, text, text, text, text, text, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_emails() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_storage_bucket_metrics(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_storage_objects(text, text, integer, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_storage_objects(text, text, integer, integer, text, text, text) FROM anon;

-- audit_fields_unchanged: internal constraint helper, not a user-facing RPC
REVOKE EXECUTE ON FUNCTION public.audit_fields_unchanged(timestamptz, uuid) FROM anon;

-- ============================================================
-- 3. Private schema functions: revoke from anon + authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION private.queue_dispatch_worker_sync_steam() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION private.queue_enqueue_worker_sync_steam() FROM anon, authenticated, public;
