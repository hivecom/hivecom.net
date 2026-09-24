import type { Tables } from '@/types/database.overrides'

// The player-facing half of a game server: where to connect and what the page
// says. Shared by the quick edit on the server page and the admin sheet. Ports,
// query config and container wiring stay admin-only.

export interface GameServerDetailsFormState {
  addresses: string[]
  description: string
  markdown: string
}

export function gameServerDetailsFromRow(
  gameserver: Pick<Tables<'network_gameservers'>, 'addresses' | 'description' | 'markdown'>,
): GameServerDetailsFormState {
  return {
    addresses: gameserver.addresses ?? [],
    description: gameserver.description ?? '',
    markdown: gameserver.markdown ?? '',
  }
}

export function gameServerDetailsPayload(form: GameServerDetailsFormState) {
  return {
    addresses: form.addresses.length > 0 ? form.addresses : null,
    description: form.description || null,
    markdown: form.markdown || null,
  }
}
