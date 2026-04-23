/**
 * useGameConnect
 *
 * Provides connection URI logic for game servers.
 * Maps game shorthands to the appropriate URI scheme (e.g. steam://) so that
 * clicking a connect button can directly launch and connect to a server rather
 * than just copying the address to the clipboard.
 *
 * Adding support for a new game:
 *   1. Add its shorthand to STEAM_CONNECT_GAMES if it uses steam://connect/
 *   2. Or add a custom entry to CUSTOM_SCHEME_MAP for non-Steam URI schemes.
 */

/** Games that support the standard steam://connect/<host>:<port> URI. */
const STEAM_CONNECT_GAMES = new Set([
  'cs2',
  'gmod',
  'tf2',
  'css',
  'hl2mp',
  'l4d2',
])

/**
 * For games that use a URI scheme other than steam://connect/ you can define a
 * custom builder here.  The function receives the address and optional port and
 * must return a full URI string.
 *
 * Example (Minecraft):
 *   'minecraft': (address, port) => `minecraft://${address}${port ? `:${port}` : ''}`
 */
const CUSTOM_SCHEME_MAP: Record<string, (address: string, port: string | null) => string> = {
  // Future entries go here
}

export type ConnectMethod = 'steam' | 'custom' | 'copy'

export interface ConnectAction {
  /** Human-readable label for the button, e.g. "Connect" or "Copy Address" */
  label: string
  /** The URI to navigate to, or null when the action is copy-only */
  uri: string | null
  /** Raw address string including port, always available for clipboard fallback */
  addressWithPort: string
  /** Which underlying mechanism this action uses */
  method: ConnectMethod
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
   * @param address      - The raw server address/IP
   * @param port         - Optional port string (e.g. "27015")
   * @param gameShorthand - The game's shorthand identifier (e.g. "cs2")
   */
  function getConnectAction(
    address: string,
    port: string | null | undefined,
    gameShorthand: string | null | undefined,
  ): ConnectAction {
    const addressWithPort = formatAddress(address, port ?? null)

    if (gameShorthand != null && gameShorthand !== '' && CUSTOM_SCHEME_MAP[gameShorthand] != null) {
      const uri = CUSTOM_SCHEME_MAP[gameShorthand](address, port ?? null)
      return { label: 'Connect', uri, addressWithPort, method: 'custom' }
    }

    if (gameShorthand != null && gameShorthand !== '' && STEAM_CONNECT_GAMES.has(gameShorthand)) {
      const uri = `steam://connect/${addressWithPort}`
      return { label: 'Connect', uri, addressWithPort, method: 'steam' }
    }

    return { label: 'Copy Address', uri: null, addressWithPort, method: 'copy' }
  }

  /**
   * Returns one ConnectAction per address for a server with potentially
   * multiple addresses.
   */
  function getConnectActions(
    addresses: string[] | null | undefined,
    port: string | null | undefined,
    gameShorthand: string | null | undefined,
  ): ConnectAction[] {
    if (addresses == null || addresses.length === 0)
      return []
    return addresses.map(a => getConnectAction(a, port, gameShorthand))
  }

  /**
   * Triggers the connect action in the browser.
   * For URI-based methods this navigates to the URI (which the OS/Steam client
   * handles).  For copy-only actions this returns false so the caller can fall
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
   * Convenience: returns true when the given shorthand has a direct-launch URI.
   */
  function supportsDirectConnect(gameShorthand: string | null | undefined): boolean {
    if (gameShorthand == null || gameShorthand === '')
      return false
    return STEAM_CONNECT_GAMES.has(gameShorthand) || gameShorthand in CUSTOM_SCHEME_MAP
  }

  return {
    getConnectAction,
    getConnectActions,
    triggerConnect,
    supportsDirectConnect,
    formatAddress,
  }
}
