// Hand-maintained overrides on top of the generated database.types.ts, which is
// never edited. Import the table helpers from here instead of the generated file.

import type { Database, Json } from './database.types'
import type { MetricsSnapshot } from './metrics'
import type { SoundDesign } from './sound'

export type { Database, Json }
export type { CompositeTypes, Enums } from './database.types'
export { Constants } from './database.types'

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

export type AppPermission = Database['public']['Enums']['app_permission']

// Type permission groups as this so a stale or misspelled group is a compile
// error instead of a silently failing string lookup.
export type PermissionResource = AppPermission extends `${infer R}.${string}` ? R : never

export type PermissionAction = 'create' | 'read' | 'update' | 'delete'

// ─────────────────────────────────────────────────────────────────────────────
// Concrete column types
// ─────────────────────────────────────────────────────────────────────────────

// { provider: { emote: userIds[] } }, e.g. provider "hivecom" or "xdd". Non-recursive
// because the generated Json hits TS2589 (instantiation too deep) inside generics.
export type ReactionData = Record<string, Record<string, string[]>>

// Non-secret only. Secrets like the Factorio RCON password live in Vault.
export interface GameserverQueryOptions {
  // Factorio RCON `/silent-command` Lua mode. It also returns player names and the
  // max-player limit, but disables save achievements, so it's off by default.
  factorioUseLua?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Override map
// ─────────────────────────────────────────────────────────────────────────────

// Applied to Row, Insert and Update. Add JSONB columns the generator can't type.
interface TableColumnOverrides {
  discussions: {
    reactions: ReactionData
    pinned_reply_id: string | null
  }
  discussion_replies: {
    reactions: ReactionData
  }
  forum_discussion_replies: {
    reactions: ReactionData
  }

  user_settings: {
    data: {
      theme: 'dark' | 'light'
      show_nsfw_warning: boolean
      show_nsfw_content: boolean
      show_offtopic_replies: boolean
      show_thread_replies: boolean
      discussion_view_mode: 'flat' | 'threaded'
      // User-curated, order preserved
      quick_reactions: string[]
      forum_pagination_mode: 'infinite' | 'paginated'
      show_forum_updates: boolean
      show_forum_recently_visited: boolean
      show_forum_archived: boolean
      show_forum_unread_bubbles: boolean
      show_user_banners: boolean
      editor_floating: boolean
      strip_image_metadata: boolean
      allow_custom_css: boolean
      allow_browser_zoom: boolean
      confirm_external_links: boolean
      admin_mini_sidebar: boolean
      admin_expanded_layout: boolean
      admin_asset_view_mode: 'table' | 'grid'
      admin_asset_flat_view: boolean
      admin_depot_view_mode: 'table' | 'grid'
      chat_colored_nicks: boolean
      chat_notify_only_mentions: boolean
      chat_autoconnect: boolean
      chat_show_inline_embeds: boolean
      chat_show_previews: boolean
      chat_font_size: number
      chat_mobile_font_size: number
      chat_mention_keywords: string[]
      chat_browser_notifications: boolean
      chat_sound_mention_choice: string
      chat_sound_message_choice: string
      chat_sound_mention_url: string
      chat_sound_message_url: string
      chat_sound_mention_design: SoundDesign | null
      chat_sound_message_design: SoundDesign | null
      chat_sound_volume: number
      app_browser_notifications: boolean
      notification_sound_choice: string
      notification_sound_url: string
      notification_sound_design: SoundDesign | null
      notification_sound_volume: number
      chat_show_timestamps: boolean
      chat_timestamp_format: string
      chat_display_mode: 'irc' | 'modern'
      chat_show_tag_messages: 'none' | 'unknown' | 'all'
      chat_typing_indicators: boolean
      chat_irc_reactions: boolean
      chat_irc_hide_embedded_links: boolean
      chat_irc_hide_sidebar_timestamps: boolean
      chat_irc_inline_images: boolean
      chat_irc_native_modes: boolean
      chat_irc_pure_relay_nicks: boolean
      chat_cache_max_messages_per_buffer: number
      // 0-100, shared by every site audio player. Mobile ignores it and plays at full.
      audio_player_volume: number
    }
  }

  metrics: {
    data: MetricsSnapshot
  }

  network_gameservers: {
    query_options: GameserverQueryOptions | null
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers - index Database directly to avoid the overloaded BaseTables
// wrapper, which causes TS2707 when re-wrapped inside a new generic.
// ─────────────────────────────────────────────────────────────────────────────

type PublicSchema = Database['public']
type PublicTablesAndViews = PublicSchema['Tables'] & PublicSchema['Views']
type PublicTableName = keyof PublicTablesAndViews

type RawRow<T extends PublicTableName> = PublicTablesAndViews[T] extends { Row: infer R } ? R : never
type RawInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T] extends { Insert: infer I } ? I : never
type RawUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T] extends { Update: infer U } ? U : never

type ApplyOverrides<Base, Overrides> = Omit<Base, keyof Overrides> & Overrides

type OverriddenRow<T extends PublicTableName>
  = T extends keyof TableColumnOverrides
    ? ApplyOverrides<RawRow<T>, TableColumnOverrides[T]>
    : RawRow<T>

type OverriddenInsert<T extends keyof PublicSchema['Tables']>
  = T extends keyof TableColumnOverrides
    ? ApplyOverrides<RawInsert<T>, Partial<TableColumnOverrides[T]>>
    : RawInsert<T>

type OverriddenUpdate<T extends keyof PublicSchema['Tables']>
  = T extends keyof TableColumnOverrides
    ? ApplyOverrides<RawUpdate<T>, Partial<TableColumnOverrides[T]>>
    : RawUpdate<T>

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers - import these instead of the generated ones
// ─────────────────────────────────────────────────────────────────────────────

export type Tables<T extends PublicTableName> = OverriddenRow<T>

export type TablesInsert<T extends keyof PublicSchema['Tables']> = OverriddenInsert<T>

export type TablesUpdate<T extends keyof PublicSchema['Tables']> = OverriddenUpdate<T>
