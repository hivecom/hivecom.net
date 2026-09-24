import type { Tables } from '@/types/database.overrides'

// The descriptive half of a game. Identity fields (name, shorthand, Steam ID)
// and assets stay admin-only because storage paths and syncs hang off them.

export const GAME_DESCRIPTION_MAX = 160

export const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

// Mirrors games_connect_uri_scheme_check so a bad scheme fails here rather than
// on insert. The URI ends up in window.location, so the allowlist matters.
export const CONNECT_URI_RE = /^(?:steam|minecraft|ts3server|https):\/\//

export interface GameDetailsFormState {
  website: string
  connect_uri: string
  connect_command: string
  description: string
  markdown: string
  genre_tags: string[]
  color: string
}

export interface GameDetailsValidation {
  color: boolean
  connect_uri: boolean
}

export function gameDetailsFromRow(game: Tables<'games'>): GameDetailsFormState {
  return {
    website: game.website ?? '',
    connect_uri: game.connect_uri ?? '',
    connect_command: game.connect_command ?? '',
    description: game.description ?? '',
    markdown: game.markdown ?? '',
    genre_tags: game.genre_tags ?? [],
    color: game.color ?? '',
  }
}

export function validateGameDetails(form: GameDetailsFormState): GameDetailsValidation {
  const connectUri = form.connect_uri.trim()

  return {
    color: !form.color || HEX_COLOR_RE.test(form.color),
    connect_uri: !connectUri || CONNECT_URI_RE.test(connectUri),
  }
}

export function gameDetailsPayload(form: GameDetailsFormState) {
  return {
    website: form.website.trim() || null,
    connect_uri: form.connect_uri.trim() || null,
    connect_command: form.connect_command.trim() || null,
    description: form.description.trim() || null,
    markdown: form.markdown.trim() || null,
    genre_tags: form.genre_tags.length > 0 ? form.genre_tags : null,
    color: form.color.trim() || null,
  }
}
