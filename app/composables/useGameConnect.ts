/**
 * useGameConnect
 *
 * Resolves how a player connects to a game server. The templates live in the
 * database (games.connect_uri, games.connect_command, and the per-server
 * network_gameservers.connect_command override) so adding a game is a data
 * change rather than a deploy.
 *
 * Two independent templates:
 *   connectUri     - navigated to on Launch, e.g. steam://connect/{address}:{port}
 *   connectCommand - console/launch args to copy, e.g. +connect {address}:{port}
 *
 * A third form, the launcher command, is derived rather than stored: it is the
 * resolved URI handed to the steam binary, for people who would rather paste a
 * line into a terminal than trust the browser's protocol handler.
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
  /** games.connect_uri - null when the game has no direct-launch support */
  connectUri: string | null
  /** network_gameservers.connect_command ?? games.connect_command */
  connectCommand: string | null
  /** games.steam_id, used by the {steam_id} token */
  steamId: number | null
}

export interface ConnectAction {
  /** The URI to navigate to, or null when the action is copy-only */
  uri: string | null
  /** Substituted console/launch command, or null when the game defines none */
  command: string | null
  /** Shell one-liner handing the URI to the Steam client, steam:// URIs only */
  launcherCommand: string | null
  /** Raw address string including port, always available for clipboard fallback */
  addressWithPort: string
  /** Which underlying mechanism this action uses */
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

/** Shape of the games columns the connect logic needs. */
export interface ConnectGameFields {
  connect_uri: string | null
  connect_command: string | null
  steam_id: number | null
}

/**
 * Resolves the game defaults against the per-server override. Kept standalone
 * so components can build the context without instantiating the composable.
 */
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
  /**
   * Formats an address + port into a single "host:port" string.
   * Returns just the host when no port is provided.
   */
  function formatAddress(address: string, port: string | null | undefined): string {
    return port != null && port !== '' ? `${address}:${port}` : address
  }

  /**
   * Returns the ConnectAction for a single address.
   *
   * @param address - The raw server address/IP
   * @param port    - Optional port string (e.g. "27015")
   * @param ctx     - Resolved connect templates for the game/server pair
   */
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

  /**
   * Returns one ConnectAction per address for a server with potentially
   * multiple addresses.
   */
  function getConnectActions(
    addresses: string[] | null | undefined,
    port: string | null | undefined,
    ctx: ConnectContext,
  ): ConnectAction[] {
    if (addresses == null || addresses.length === 0)
      return []
    return addresses.map(a => getConnectAction(a, port, ctx))
  }

  /**
   * Triggers the connect action in the browser.
   * For URI-based methods this navigates to the URI (which the OS/Steam client
   * handles). For copy-only actions this returns false so the caller can fall
   * back to clipboard copy.
   *
   * Returns true if a URI was triggered, false if the caller must handle copy.
   */
  function triggerConnect(action: ConnectAction): boolean {
    if (action.uri != null) {
      window.location.href = action.uri
      return true
    }
    return false
  }

  /**
   * Convenience: returns true when the game has a direct-launch URI template.
   * Note this is template-level, so it can still resolve to null per address if
   * the server is missing a port or the game is missing a Steam ID.
   */
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
