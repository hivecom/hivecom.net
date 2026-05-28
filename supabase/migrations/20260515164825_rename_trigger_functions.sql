-- Rename single-purpose trigger-callback functions to use the trigger_ prefix.
-- Generic utilities called by multiple triggers (update_audit_fields,
-- create_discussion_for_entity, sync_discussion_from_entity,
-- sync_discussion_markdown_from_entity, normalize_mentions_on_markdown)
-- are intentionally left unchanged - they are reusable helpers, not
-- trigger-specific.

-- alerts
ALTER FUNCTION public.fill_alert_acknowledged_fields()
  RENAME TO trigger_fill_alert_acknowledged_fields;

-- complaints
ALTER FUNCTION public.notify_discord_new_complaint()
  RENAME TO trigger_notify_discord_new_complaint;

-- discussion_replies
ALTER FUNCTION public.cascade_reply_offtopic()
  RENAME TO trigger_cascade_reply_offtopic;

ALTER FUNCTION public.cleanup_reply_media_on_hard_delete()
  RENAME TO trigger_cleanup_reply_media_on_hard_delete;

ALTER FUNCTION public.cleanup_reply_media_on_soft_delete()
  RENAME TO trigger_cleanup_reply_media_on_soft_delete;

ALTER FUNCTION public.clear_pinned_reply_on_delete()
  RENAME TO trigger_clear_pinned_reply_on_delete;

ALTER FUNCTION public.inherit_discussion_nsfw_on_reply_insert()
  RENAME TO trigger_inherit_discussion_nsfw_on_reply_insert;

ALTER FUNCTION public.inherit_reply_offtopic_on_insert()
  RENAME TO trigger_inherit_reply_offtopic_on_insert;

ALTER FUNCTION public.prevent_replies_on_draft_discussion()
  RENAME TO trigger_prevent_replies_on_draft_discussion;

ALTER FUNCTION public.protect_reactions_column()
  RENAME TO trigger_protect_reactions_column;

ALTER FUNCTION public.protect_reply_content_from_non_author()
  RENAME TO trigger_protect_reply_content_from_non_author;

ALTER FUNCTION public.protect_reply_offtopic_field()
  RENAME TO trigger_protect_reply_offtopic_field;

ALTER FUNCTION public.scrub_discussion_reply_on_soft_delete()
  RENAME TO trigger_scrub_discussion_reply_on_soft_delete;

ALTER FUNCTION public.set_reply_is_forum_reply()
  RENAME TO trigger_set_reply_is_forum_reply;

ALTER FUNCTION public.update_discussion_last_activity()
  RENAME TO trigger_update_discussion_last_activity;

ALTER FUNCTION public.update_discussion_replies_audit_fields()
  RENAME TO trigger_update_discussion_replies_audit_fields;

ALTER FUNCTION public.update_discussion_reply_count()
  RENAME TO trigger_update_discussion_reply_count;

-- discussion_topics
ALTER FUNCTION public.prevent_discussion_topic_cycles()
  RENAME TO trigger_prevent_discussion_topic_cycles;

ALTER FUNCTION public.update_discussion_topics_audit_fields()
  RENAME TO trigger_update_discussion_topics_audit_fields;

-- discussions
ALTER FUNCTION public.auto_subscribe_discussion_author()
  RENAME TO trigger_auto_subscribe_discussion_author;

ALTER FUNCTION public.cascade_discussion_nsfw_to_replies()
  RENAME TO trigger_cascade_discussion_nsfw_to_replies;

ALTER FUNCTION public.cleanup_discussion_media_on_hard_delete()
  RENAME TO trigger_cleanup_discussion_media_on_hard_delete;

ALTER FUNCTION public.enforce_discussion_draft_rules()
  RENAME TO trigger_enforce_discussion_draft_rules;

ALTER FUNCTION public.prevent_deleting_linked_discussions()
  RENAME TO trigger_prevent_deleting_linked_discussions;

ALTER FUNCTION public.protect_discussion_admin_fields()
  RENAME TO trigger_protect_discussion_admin_fields;

ALTER FUNCTION public.sync_replies_is_forum_reply()
  RENAME TO trigger_sync_replies_is_forum_reply;

ALTER FUNCTION public.update_discussions_audit_fields()
  RENAME TO trigger_update_discussions_audit_fields;

ALTER FUNCTION public.update_topic_aggregate_counts()
  RENAME TO trigger_update_topic_aggregate_counts;

ALTER FUNCTION public.update_topic_last_activity()
  RENAME TO trigger_update_topic_last_activity;

ALTER FUNCTION public.validate_discussion_accepted_reply()
  RENAME TO trigger_validate_discussion_accepted_reply;

ALTER FUNCTION public.validate_discussion_pinned_reply()
  RENAME TO trigger_validate_discussion_pinned_reply;

-- events
ALTER FUNCTION public.sync_discord_events_delete()
  RENAME TO trigger_sync_discord_events_delete;

ALTER FUNCTION public.sync_discord_events_insert()
  RENAME TO trigger_sync_discord_events_insert;

ALTER FUNCTION public.sync_discord_events_update()
  RENAME TO trigger_sync_discord_events_update;

ALTER FUNCTION public.sync_google_calendar_delete()
  RENAME TO trigger_sync_google_calendar_delete;

ALTER FUNCTION public.sync_google_calendar_insert()
  RENAME TO trigger_sync_google_calendar_insert;

ALTER FUNCTION public.sync_google_calendar_update()
  RENAME TO trigger_sync_google_calendar_update;

-- presences_steam
ALTER FUNCTION public.upsert_data_steam_game()
  RENAME TO trigger_upsert_data_steam_game;

-- profiles
ALTER FUNCTION public.delete_steam_presence_on_unlink()
  RENAME TO trigger_delete_steam_presence_on_unlink;

ALTER FUNCTION public.prevent_username_set_regression()
  RENAME TO trigger_prevent_username_set_regression;

ALTER FUNCTION public.refresh_theme_usage()
  RENAME TO trigger_refresh_theme_usage;

ALTER FUNCTION public.soft_delete_replies_on_profile_delete()
  RENAME TO trigger_soft_delete_replies_on_profile_delete;

ALTER FUNCTION public.notify_discord_ban_status_changed()
  RENAME TO trigger_notify_discord_ban_status_changed;

ALTER FUNCTION public.notify_discord_supporter_status_changed()
  RENAME TO trigger_notify_discord_supporter_status_changed;

ALTER FUNCTION public.notify_discord_username_changed()
  RENAME TO trigger_notify_discord_username_changed;

-- themes
ALTER FUNCTION public.handle_theme_owner_deleted()
  RENAME TO trigger_handle_theme_owner_deleted;

ALTER FUNCTION public.sanitize_theme_custom_css()
  RENAME TO trigger_sanitize_theme_custom_css;

-- referendums
ALTER FUNCTION public.delete_votes_on_choices_removal()
  RENAME TO trigger_delete_votes_on_choices_removal;
