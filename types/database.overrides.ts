/**
 * database.overrides.ts
 *
 * Hand-maintained type overrides that sit on top of the generated
 * `database.types.ts`.  When Supabase regenerates that file, only THIS file
 * needs to be updated - the generated file stays untouched.
 *
 * ## How to use
 *
 * Import `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, and
 * `CompositeTypes` from HERE instead of from `database.types.ts`:
 *
 *   import type { Tables } from '@/types/database.overrides'
 *
 * `Database` and `Json` should still be imported directly from
 * `database.types.ts` when needed at the Supabase client level.
 *
 * ## Adding overrides
 *
 * 1. Define the concrete column type below (see `ReactionData`).
 * 2. Add an entry to `TableColumnOverrides` mapping
 *    `tableName -> { columnName: ConcreteType }`.
 * 3. The `Tables<T>` helper below will automatically apply the override.
 */

import type { Database, Json } from './database.types'

// Re-export pass-throughs so callers only need one import source.
export type { Database, Json }
export type { CompositeTypes, Enums } from './database.types'
export { Constants } from './database.types'

// ─────────────────────────────────────────────────────────────────────────────
// Concrete column types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Concrete type for the `reactions` JSONB column.
 *
 * Shape stored in the DB:
 *   {
 *     "<provider>": {           e.g. "hivecom", "xdd"
 *       "<emote>": ["<uuid>"]   emote key → array of user UUIDs who reacted
 *     }
 *   }
 *
 * Using a non-recursive type (instead of the generated `Json`) avoids
 * TS2589 "type instantiation excessively deep" errors when the type is spread
 * inside computed properties or complex generics.
 */
export type ReactionData = Record<string, Record<string, string[]>>

// ─────────────────────────────────────────────────────────────────────────────
// Override map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Declare column-level overrides here.
 *
 * Each key is a public table or view name; the value is a partial record of
 * column names mapped to their desired TypeScript type.  The override is
 * applied to all three variants (Row, Insert, Update).
 *
 * Add new entries here whenever a JSONB column needs a precise type that the
 * generator cannot infer.
 */
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
  settings: {
    data: {
      theme: 'dark' | 'light'
      show_nsfw_warning: boolean
      show_nsfw_content: boolean
      show_offtopic_replies: boolean
      show_thread_replies: boolean
      discussion_view_mode: 'flat' | 'threaded'
      show_forum_updates: boolean
      show_forum_recently_visited: boolean
      show_forum_archived: boolean
      show_forum_unread_bubbles: boolean
      editor_floating: boolean
      strip_image_metadata: boolean
    }
  }
  // is_public is not yet in the generated types - added via migration
  // 20260315190002_referendums_is_public.sql. Remove this override once
  // `npx supabase gen types` has been re-run and the column appears in
  // database.types.ts.
  referendums: {
    is_public: boolean
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

/** Replace override columns; keep everything else untouched. */
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

/**
 * Drop-in replacement for the generated `Tables<T>` helper.
 * Returns the Row type with any declared column overrides applied.
 *
 * @example
 *   import type { Tables } from '@/types/database.overrides'
 *   const reply: Tables<'discussion_replies'>
 *   reply.reactions // → ReactionData instead of Json
 */
export type Tables<T extends PublicTableName> = OverriddenRow<T>

/**
 * Drop-in replacement for the generated `TablesInsert<T>` helper.
 * Only writable tables (not views) are accepted.
 */
export type TablesInsert<T extends keyof PublicSchema['Tables']> = OverriddenInsert<T>

/**
 * Drop-in replacement for the generated `TablesUpdate<T>` helper.
 * Only writable tables (not views) are accepted.
 */
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = OverriddenUpdate<T>
