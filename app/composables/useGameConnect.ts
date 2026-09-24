/**
 * Connect templates live in the database (games.connect_uri, games.connect_command
 * and the per-server override), so adding a game is a data change, not a deploy.
 *
 * Tokens: {address} {port} {steam_id}, plus {command} in the URI only, which
 * interpolates the URL-encoded connectCommand. That covers games like Cobalt
 * that have no Steam connect handler and launch via
 * steam://rungameid/{steam_id}//{command}.
 */

/** Tokens resolve to null when the data they need is missing. */
type TokenMap = Record<string, string | null>

export type ConnectMethod = 'uri' | 'copy'

export interface ConnectContext {
  /** Null when the game has no direct-launch support. */
  connectUri: string | null

  /** The per-server override, falling back to the game's command. */
  connectCommand: string | null

  steamId: number | null
}

export interface ConnectAction {
  /** Null when the action is copy-only. */
  uri: string | null

  /** Null when the game defines none. */
  command: string | null

  /** Shell one-liner handing the URI to the Steam client, steam:// URIs only. */
  launcherCommand: string | null

  /** Always set, for the clipboard fallback. */
  addressWithPort: string

  method: ConnectMethod
}

/**
 * Wraps a URI as a shell command for the Steam client, e.g.
 *   steam "steam://rungameid/357340//+connect 136.243.92.178:27051"
 *
 * Only steam:// gets one. Other schemes have no launcher binary we can assume,
 * and emitting `steam "minecraft://..."` would just be wrong.
 */
function buildLauncherCommand(uri: string | null): string | null {
  if (uri == null || !uri.startsWith('steam://'))
    return null

  return `steam "${uri.replace(/"/g, '\\"')}"`
}

/**
 * Encodes a command for embedding in a URI path segment. encodeURIComponent is
 * too aggressive here: it escapes `+` and `:`, and Steam wants the literal
 * `steam://rungameid/357340//+connect%20host:27051` shape. So only escape what
 * would actually terminate or reinterpret the path.
 */
function encodeCommandForUri(command: string): string {
  return encodeURI(command).replace(
    /[#?&]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/**
 * Substitutes {token} placeholders. Returns null if the template references a
 * token we have no value for, since a half-filled command (`+connect host:`)
 * is worse than offering nothing.
 */
function substitute(template: string, tokens: TokenMap): string | null {
  let missing = false

  const result = template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in tokens))
      return match

    const value = tokens[key]
    if (value == null || value === '') {
      missing = true
      return ''
    }
    return value
  })

  return missing ? null : result
}

export interface ConnectGameFields {
  connect_uri: string | null
  connect_command: string | null
  steam_id: number | null
}

// Standalone so components can build the context without the composable.
export function buildConnectContext(
  game: ConnectGameFields | null | undefined,
  gameserver?: { connect_command: string | null } | null,
): ConnectContext {
  return {
    connectUri: game?.connect_uri ?? null,
    connectCommand: gameserver?.connect_command ?? game?.connect_command ?? null,
    steamId: game?.steam_id ?? null,
  }
}

export function useGameConnect() {
  function formatAddress(address: string, port: string | null | undefined): string {
    return port != null && port !== '' ? `${address}:${port}` : address
  }

  function getConnectAction(
    address: string,
    port: string | null | undefined,
    ctx: ConnectContext,
  ): ConnectAction {
    const addressWithPort = formatAddress(address, port ?? null)

    const baseTokens: TokenMap = {
      address,
      port: port ?? null,
      steam_id: ctx.steamId != null ? String(ctx.steamId) : null,
    }

    const command = ctx.connectCommand != null && ctx.connectCommand !== ''
      ? substitute(ctx.connectCommand, baseTokens)
      : null

    const hasUri = ctx.connectUri != null && ctx.connectUri !== ''

    const uri = hasUri
      ? substitute(ctx.connectUri!, {
          ...baseTokens,
          command: command != null ? encodeCommandForUri(command) : null,
        })
      : null

    // The shell quotes the argument, so the launcher form embeds the command
    // unencoded. That keeps it readable and matches what you would type.
    const rawUri = hasUri
      ? substitute(ctx.connectUri!, { ...baseTokens, command })
      : null

    return {
      uri,
      command,
      launcherCommand: buildLauncherCommand(rawUri),
      addressWithPort,
      method: uri != null ? 'uri' : 'copy',
    }
  }

  function getConnectActions(
    addresses: string[] | null | undefined,
    port: string | null | undefined,
    ctx: ConnectContext,
  ): ConnectAction[] {
    if (addresses == null || addresses.length === 0)
      return []

    return addresses.map(a => getConnectAction(a, port, ctx))
  }

  // Returns false for copy-only actions, so the caller falls back to the clipboard.
  function triggerConnect(action: ConnectAction): boolean {
    if (action.uri != null) {
      window.location.href = action.uri
      return true
    }
    return false
  }

  // Template-level, so it can still resolve to null per address when a port or
  // Steam ID is missing.
  function supportsDirectConnect(ctx: ConnectContext): boolean {
    return ctx.connectUri != null && ctx.connectUri !== ''
  }

  return {
    getConnectAction,
    getConnectActions,
    triggerConnect,
    supportsDirectConnect,
    formatAddress,
  }
}
