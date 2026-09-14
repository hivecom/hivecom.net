import type { StorageAsset } from '@/lib/storageAssets'
import { useRuntimeConfig, useSupabaseClient } from '#imports'
import { extractExtension } from '@/lib/storageAssets'

// Reserved owner for uploads with no signed-in user. Surfaced as "anonymous".
const ANONYMOUS_OWNER = '_anonymous'

// Synthetic bucket id for adapted depot files. Depot has no Supabase bucket, but
// the shared asset components key off bucket_id only for the forums fallback, so
// any non-forums value is safe here.
const DEPOT_BUCKET_ID = 'depot'

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

// The caller's own storage usage against their quota. limit is bytes; a limit of
// 0 (or unlimited true) means no cap. Reported by GET /quota.
export interface DepotQuota {
  used: number
  limit: number
  unlimited: boolean
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

// Sort columns for the uploader leaderboard. file_count is the upload count,
// file_size the total storage. Distinct from the /admin/files enum.
export type UploaderSort = 'file_count' | 'file_size'

export interface MintKeyOptions {
  scopes?: string[]

  /** RFC3339 or YYYY-MM-DD; omit for a key that never expires. */
  expiresAt?: string
}

// Maps a depot upload onto the shared StorageAsset shape so it can flow through
// the same grid, lightbox, and details components the Assets page uses. Depot is
// flat and gateway-backed, so there are no folders: every file maps to a
// `type: 'file'` asset whose path is the object key. Anonymous uploads carry no
// uploader so they resolve to the "Unknown" placeholder.
export function depotFileToStorageAsset(file: DepotFile): StorageAsset {
  // Only the admin listing carries an uploader; self files have none, which is
  // fine since the sharing page never shows an uploader for your own uploads.
  const uploaderAccount = 'uploader_account' in file ? (file as DepotAdminFile).uploader_account : ''
  const account = uploaderAccount === ANONYMOUS_OWNER || uploaderAccount === ''
    ? null
    : uploaderAccount

  return {
    id: file.object_key,
    bucket_id: DEPOT_BUCKET_ID,
    name: file.original_filename,
    path: file.object_key,
    type: 'file',
    size: file.size,
    created_at: file.uploaded_at,
    updated_at: file.uploaded_at,
    last_accessed_at: null,
    // Depot has no Supabase FileMetadata; the asset components only read
    // uploadedBy off it, so a narrowed object is enough here.
    metadata: account ? { uploadedBy: account } as unknown as StorageAsset['metadata'] : null,
    mimeType: file.content_type || null,
    extension: extractExtension(file.original_filename),
    publicUrl: file.url,
  }
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

  // Depot puts its own message in an `error` field. Fall back to the status code
  // when the body isn't JSON at all (a gateway 502, say).
  async function fail(res: Response, fallback: string): Promise<Error> {
    const data = await res.json().catch(() => ({})) as { error?: string }

    return new Error(data?.error ?? `${fallback} (HTTP ${res.status})`)
  }

  // Query builder shared by every listing endpoint. Undefined and empty values
  // are dropped, since Depot reads an absent param as "no filter".
  function queryString(params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams()

    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '')
        search.set(key, String(value))
    }

    const qs = search.toString()

    return qs ? `?${qs}` : ''
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

  // listFiles lists the caller's own uploads, paged/sorted/searchable. The
  // gateway forces the owner to the authenticated subject, so this only ever
  // returns your files. Requires a signed-in identity (no anonymous listing).
  async function listFiles(opts: ListFilesOptions = {}): Promise<DepotFilePage<DepotFile>> {
    const qs = queryString({
      limit: opts.limit,
      offset: opts.offset,
      sort: opts.sort,
      order: opts.order,
      q: opts.q,
    })

    const res = await fetch(`${baseUrl}/files${qs}`, { headers: await authHeaders() })

    if (!res.ok)
      throw await fail(res, 'Could not load files')

    const data = await res.json() as { files?: DepotFile[], total?: number }

    return { files: data.files ?? [], total: data.total ?? 0 }
  }

  // getQuota reports the caller's current usage against their limit. A limit of 0
  // (or unlimited) means no cap. Requires a signed-in identity.
  async function getQuota(): Promise<DepotQuota> {
    const res = await fetch(`${baseUrl}/quota`, { headers: await authHeaders() })

    if (!res.ok)
      throw await fail(res, 'Could not load quota')

    const data = await res.json() as Partial<DepotQuota>

    return {
      used: data.used ?? 0,
      limit: data.limit ?? 0,
      unlimited: data.unlimited ?? (data.limit ?? 0) <= 0,
    }
  }

  // adminListFiles lists uploads across all owners. Requires an admin caller
  // (an OIDC login whose configured claim matched); Depot returns 403 otherwise.
  async function adminListFiles(opts: AdminListFilesOptions = {}): Promise<DepotFilePage<DepotAdminFile>> {
    const qs = queryString({
      limit: opts.limit,
      offset: opts.offset,
      sort: opts.sort,
      order: opts.order,
      q: opts.q,
      account: opts.account,
      issuer: opts.issuer,
      content_type: opts.contentType,
    })

    const res = await fetch(`${baseUrl}/admin/files${qs}`, { headers: await authHeaders() })

    if (!res.ok)
      throw await fail(res, 'Could not load files')

    const data = await res.json() as { files?: DepotAdminFile[], total?: number }

    return { files: data.files ?? [], total: data.total ?? 0 }
  }

  // adminMetrics reports aggregate counts and size. It honors the same owner and
  // content-type filters as adminListFiles, so passing an account scopes the
  // numbers to one user. Admin only.
  async function adminMetrics(opts: AdminListFilesOptions = {}): Promise<DepotMetrics> {
    const qs = queryString({
      account: opts.account,
      issuer: opts.issuer,
      content_type: opts.contentType,
      q: opts.q,
    })

    const res = await fetch(`${baseUrl}/admin/metrics${qs}`, { headers: await authHeaders() })

    if (!res.ok)
      throw await fail(res, 'Could not load metrics')

    const data = await res.json() as Partial<DepotMetrics>

    return {
      total_files: data.total_files ?? 0,
      total_size: data.total_size ?? 0,
      total_images: data.total_images ?? 0,
    }
  }

  // adminListUploaders ranks uploaders by total bytes (most first) by default,
  // with each uploader's file count. sort/order let the table order by upload
  // count (file_count) or storage (file_size) server-side. Admin only.
  async function adminListUploaders(opts: { limit?: number, offset?: number, sort?: UploaderSort, order?: 'asc' | 'desc' } = {}): Promise<{ users: DepotUploader[], total: number }> {
    const qs = queryString({
      limit: opts.limit,
      offset: opts.offset,
      sort: opts.sort,
      order: opts.order,
    })

    const res = await fetch(`${baseUrl}/admin/users${qs}`, { headers: await authHeaders() })

    if (!res.ok)
      throw await fail(res, 'Could not load uploaders')

    const data = await res.json() as { users?: DepotUploader[], total?: number }

    return { users: data.users ?? [], total: data.total ?? 0 }
  }

  // adminContentTypes lists the distinct content types across all uploads, for
  // the admin file-type filter dropdown. Admin only.
  async function adminContentTypes(): Promise<string[]> {
    const res = await fetch(`${baseUrl}/admin/content-types`, { headers: await authHeaders() })

    if (!res.ok)
      throw await fail(res, 'Could not load content types')

    const data = await res.json() as { content_types?: string[] }

    return data.content_types ?? []
  }

  // wipeMyFiles removes every one of the caller's own uploads in a single call.
  // The gateway scopes it to the authenticated identity, so it can only ever
  // wipe your own files. Returns how many uploads were removed. Used by the
  // standalone "wipe all" action and by account deletion (call it while the
  // session is still valid, before the account is gone).
  async function wipeMyFiles(): Promise<{ deleted: number }> {
    const res = await fetch(`${baseUrl}/files`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })

    if (!res.ok)
      throw await fail(res, 'Could not wipe uploads')

    const data = await res.json() as { deleted?: number }

    return { deleted: data.deleted ?? 0 }
  }

  // adminWipeUserFiles removes every upload owned by one user. Admin only (an
  // OIDC login whose configured claim matched); Depot returns 403 otherwise. The
  // account is the user's Supabase id (the OIDC subject); issuer is optional and
  // narrows the wipe to one tenant when given. Returns the count removed.
  async function adminWipeUserFiles(account: string, issuer?: string): Promise<{ deleted: number }> {
    // An empty account would drop the filter entirely and widen this DELETE to
    // every upload in the gateway, so refuse it before it goes out.
    if (!account)
      throw new Error('Cannot wipe uploads without an account.')

    const res = await fetch(`${baseUrl}/admin/files${queryString({ account, issuer })}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })

    if (!res.ok)
      throw await fail(res, 'Could not wipe uploads')

    const data = await res.json() as { deleted?: number }

    return { deleted: data.deleted ?? 0 }
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

  return { baseUrl, host, uploadFile, listFiles, getQuota, mintKey, listKeys, revokeKey, adminListFiles, adminMetrics, adminListUploaders, adminContentTypes, deleteFile, wipeMyFiles, adminWipeUserFiles }
}
