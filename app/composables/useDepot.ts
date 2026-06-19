import { useRuntimeConfig, useSupabaseClient } from '#imports'

export interface DepotApiKey {
  id: string
  label: string
  scopes: string[]
  expires_at?: string | null
  last_used_at?: string | null
  created_at: string
}

// A freshly minted key also carries the raw secret, shown exactly once.
export interface DepotMintedKey extends DepotApiKey {
  key: string
}

export interface DepotUpload {
  object_key: string
  url: string
  size: number
  content_type?: string
}

export interface MintKeyOptions {
  scopes?: string[]
  /** RFC3339 or YYYY-MM-DD; omit for a key that never expires. */
  expiresAt?: string
}

/**
 * Client for Orbit Depot (the storage gateway at depotUrl). Wraps the
 * authenticated endpoints: one-shot uploads, plus API key mint/list/revoke.
 * Every call carries the current user's Supabase JWT, so the user must be
 * signed in. Errors throw as `Error` with Depot's message; callers own their
 * own loading state and toasts.
 */
export function useDepot() {
  const supabase = useSupabaseClient()
  const baseUrl = useRuntimeConfig().public.depotUrl

  // Display host, e.g. "depot.hivecom.net". Falls back to the raw URL.
  let host = baseUrl
  try {
    host = new URL(baseUrl).host
  }
  catch {
    // keep the raw URL as the display host
  }

  async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token)
      throw new Error('You are not signed in.')
    return { Authorization: `Bearer ${token}`, ...extra }
  }

  async function fail(res: Response, fallback: string): Promise<Error> {
    const data = await res.json().catch(() => ({})) as { error?: string }
    return new Error(data?.error ?? `${fallback} (HTTP ${res.status})`)
  }

  // One-shot multipart upload. Depot proxies the bytes and returns the public
  // download URL. The file field must be named "file".
  async function uploadFile(file: File, opts: { place?: string } = {}): Promise<DepotUpload> {
    const body = new FormData()
    body.append('file', file)
    if (opts.place)
      body.append('place', opts.place)

    const res = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: await authHeaders(),
      body,
    })
    if (!res.ok)
      throw await fail(res, 'Upload failed')
    return res.json() as Promise<DepotUpload>
  }

  // Mint an API key. The response carries the raw secret once; persist it then.
  async function mintKey(label: string, opts: MintKeyOptions = {}): Promise<DepotMintedKey> {
    const res = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ label, scopes: opts.scopes, expires_at: opts.expiresAt }),
    })
    if (!res.ok)
      throw await fail(res, 'Could not mint key')
    return res.json() as Promise<DepotMintedKey>
  }

  async function listKeys(): Promise<DepotApiKey[]> {
    const res = await fetch(`${baseUrl}/keys`, { headers: await authHeaders() })
    if (!res.ok)
      throw await fail(res, 'Could not load keys')
    const data = await res.json() as { keys?: DepotApiKey[] }
    return data.keys ?? []
  }

  async function revokeKey(id: string): Promise<void> {
    const res = await fetch(`${baseUrl}/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    // Success is 204 No Content; anything else carries an error body.
    if (!res.ok)
      throw await fail(res, 'Could not revoke key')
  }

  return { baseUrl, host, uploadFile, mintKey, listKeys, revokeKey }
}
