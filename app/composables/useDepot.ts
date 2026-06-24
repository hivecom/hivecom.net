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

// A stored upload as returned by the listing endpoints.
export interface DepotFile {
  object_key: string
  url: string
  size: number
  content_type: string
  original_filename: string
  uploaded_at: string
}

// The admin listing adds the uploader identity the self listing never exposes.
export interface DepotAdminFile extends DepotFile {
  uploader_account: string
  uploader_issuer: string
}

export interface ListFilesOptions {
  limit?: number
  offset?: number
  sort?: 'uploaded_at' | 'file_size'
  order?: 'asc' | 'desc'
  /** Case-insensitive substring on the original filename. */
  q?: string
}

// Admin listing layers owner and content-type filters on top of the shared ones.
export interface AdminListFilesOptions extends ListFilesOptions {
  account?: string
  issuer?: string
  contentType?: string
}

export interface DepotFilePage<T> {
  files: T[]
  total: number
}

// Aggregate upload metrics for the admin KPI cards. total_size is bytes;
// total_images counts uploads whose content type is image/*.
export interface DepotMetrics {
  total_files: number
  total_size: number
  total_images: number
}

// One uploader's footprint for the admin leaderboard. account is the raw OIDC
// subject (the Supabase user id), which the client resolves to a username.
export interface DepotUploader {
  account: string
  issuer: string
  files: number
  bytes: number
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

  // adminListFiles lists uploads across all owners. Requires an admin caller
  // (an OIDC login whose configured claim matched); Depot returns 403 otherwise.
  async function adminListFiles(opts: AdminListFilesOptions = {}): Promise<DepotFilePage<DepotAdminFile>> {
    const params = new URLSearchParams()
    if (opts.limit != null)
      params.set('limit', String(opts.limit))
    if (opts.offset != null)
      params.set('offset', String(opts.offset))
    if (opts.sort)
      params.set('sort', opts.sort)
    if (opts.order)
      params.set('order', opts.order)
    if (opts.q)
      params.set('q', opts.q)
    if (opts.account)
      params.set('account', opts.account)
    if (opts.issuer)
      params.set('issuer', opts.issuer)
    if (opts.contentType)
      params.set('content_type', opts.contentType)

    const qs = params.toString()
    const res = await fetch(`${baseUrl}/admin/files${qs ? `?${qs}` : ''}`, { headers: await authHeaders() })
    if (!res.ok)
      throw await fail(res, 'Could not load files')
    const data = await res.json() as { files?: DepotAdminFile[], total?: number }
    return { files: data.files ?? [], total: data.total ?? 0 }
  }

  // adminMetrics reports aggregate counts and size. It honors the same owner and
  // content-type filters as adminListFiles, so passing an account scopes the
  // numbers to one user. Admin only.
  async function adminMetrics(opts: AdminListFilesOptions = {}): Promise<DepotMetrics> {
    const params = new URLSearchParams()
    if (opts.account)
      params.set('account', opts.account)
    if (opts.issuer)
      params.set('issuer', opts.issuer)
    if (opts.contentType)
      params.set('content_type', opts.contentType)
    if (opts.q)
      params.set('q', opts.q)

    const qs = params.toString()
    const res = await fetch(`${baseUrl}/admin/metrics${qs ? `?${qs}` : ''}`, { headers: await authHeaders() })
    if (!res.ok)
      throw await fail(res, 'Could not load metrics')
    const data = await res.json() as Partial<DepotMetrics>
    return {
      total_files: data.total_files ?? 0,
      total_size: data.total_size ?? 0,
      total_images: data.total_images ?? 0,
    }
  }

  // adminListUploaders ranks uploaders by total bytes (most first), with each
  // uploader's file count. Admin only.
  async function adminListUploaders(opts: { limit?: number, offset?: number } = {}): Promise<{ users: DepotUploader[], total: number }> {
    const params = new URLSearchParams()
    if (opts.limit != null)
      params.set('limit', String(opts.limit))
    if (opts.offset != null)
      params.set('offset', String(opts.offset))

    const qs = params.toString()
    const res = await fetch(`${baseUrl}/admin/users${qs ? `?${qs}` : ''}`, { headers: await authHeaders() })
    if (!res.ok)
      throw await fail(res, 'Could not load uploaders')
    const data = await res.json() as { users?: DepotUploader[], total?: number }
    return { users: data.users ?? [], total: data.total ?? 0 }
  }

  // deleteFile removes one upload by its object key. A normal caller may only
  // delete its own; an admin caller deletes any (the moderation path). The key
  // is a slash-separated path, so encode each segment but keep the separators.
  async function deleteFile(objectKey: string): Promise<void> {
    const path = objectKey.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(`${baseUrl}/file/${path}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    // Success is 204 No Content; anything else carries an error body.
    if (!res.ok)
      throw await fail(res, 'Could not delete file')
  }

  return { baseUrl, host, uploadFile, mintKey, listKeys, revokeKey, adminListFiles, adminMetrics, adminListUploaders, deleteFile }
}
