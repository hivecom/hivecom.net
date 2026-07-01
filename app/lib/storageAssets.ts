import type { FileObject } from '@supabase/storage-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import JSZip from 'jszip'

export const CMS_BUCKET_ID = 'hivecom-cms' as const
export const FORUMS_BUCKET_ID = 'hivecom-content-forums' as const
export const STATIC_BUCKET_ID = 'hivecom-content-static' as const
export const USERS_BUCKET_ID = 'hivecom-content-users' as const

export const STORAGE_BUCKET_IDS = [CMS_BUCKET_ID, FORUMS_BUCKET_ID, STATIC_BUCKET_ID, USERS_BUCKET_ID] as const

export type StorageBucketId
  = | typeof CMS_BUCKET_ID
    | typeof FORUMS_BUCKET_ID
    | typeof STATIC_BUCKET_ID
    | typeof USERS_BUCKET_ID

// File size limits in bytes, mirroring the bucket config in storage.buckets.
export const BUCKET_SIZE_LIMITS: Record<StorageBucketId, number> = {
  [CMS_BUCKET_ID]: 52428800, // 50 MB
  [FORUMS_BUCKET_ID]: 52428800, // 50 MB
  [STATIC_BUCKET_ID]: 5242880, // 5 MB
  [USERS_BUCKET_ID]: 1048576, // 1 MB
}

// Archive MIME types and extensions. Browsers report these inconsistently
// (often '' or application/octet-stream), so we match by extension as a fallback.
export const ARCHIVE_MIME_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed', 'application/x-tar', 'application/gzip', 'application/x-gzip']
export const ARCHIVE_EXTENSIONS = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']

// Allowed MIME patterns per bucket, mirroring allowed_mime_types in
// storage.buckets. `null` means the bucket accepts any type. Patterns support a
// trailing `/*` wildcard (e.g. image/*) just like the database column.
export const BUCKET_ALLOWED_MIME_TYPES: Record<StorageBucketId, string[] | null> = {
  [CMS_BUCKET_ID]: null,
  [FORUMS_BUCKET_ID]: ['application/json', 'image/*', 'video/*', 'audio/*', 'text/csv', ...ARCHIVE_MIME_TYPES],
  [STATIC_BUCKET_ID]: ['application/json', 'image/*', 'video/*', 'text/csv'],
  [USERS_BUCKET_ID]: ['image/*', 'video/webm'],
}

function mimeMatchesPattern(pattern: string, type: string): boolean {
  if (pattern.endsWith('/*'))
    return type.startsWith(pattern.slice(0, -1))
  return pattern === type
}

// Whether a file is allowed in a bucket, by MIME, with an extension fallback for
// archives whose browser-reported MIME is empty or octet-stream.
export function isFileAllowedForBucket(bucketId: StorageBucketId, fileType: string, fileName: string): boolean {
  const patterns = BUCKET_ALLOWED_MIME_TYPES[bucketId]
  if (patterns == null)
    return true
  if (fileType && patterns.some(pattern => mimeMatchesPattern(pattern, fileType)))
    return true

  const bucketAllowsArchives = patterns.some(pattern => ARCHIVE_MIME_TYPES.includes(pattern))
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return bucketAllowsArchives && ARCHIVE_EXTENSIONS.includes(extension)
}

// Value for an <input type="file"> accept attribute. Empty string means any
// type (CMS). Archive extensions are appended since their MIME is unreliable.
export function getBucketAcceptAttr(bucketId: StorageBucketId): string {
  const patterns = BUCKET_ALLOWED_MIME_TYPES[bucketId]
  if (patterns == null)
    return ''
  const archiveExtensions = patterns.some(pattern => ARCHIVE_MIME_TYPES.includes(pattern))
    ? ARCHIVE_EXTENSIONS.map(extension => `.${extension}`)
    : []
  return [...patterns, ...archiveExtensions].join(',')
}

export type SortColumn = 'name' | 'updated_at' | 'created_at'
export type SortOrder = 'asc' | 'desc'
export type FlatSortColumn = 'name' | 'updated_at' | 'created_at' | 'size'

export interface FlatListOptions {
  prefix?: string
  limit?: number
  offset?: number
  search?: string
  sortBy?: {
    column: FlatSortColumn
    order: SortOrder
  }
}

export interface FlatListResult {
  assets: StorageAsset[]
  totalCount: number
  /** True when there may be more results (returned count === limit). */
  hasMore: boolean
}

export async function listStorageObjectsFlat(
  client: SupabaseClient<Database>,
  bucketId: StorageBucketId,
  options: FlatListOptions = {},
): Promise<FlatListResult> {
  const limit = options.limit ?? 100
  const offset = options.offset ?? 0
  const sortCol = options.sortBy?.column ?? 'updated_at'
  const sortOrder = options.sortBy?.order ?? 'desc'
  const prefix = normalizePrefix(options.prefix)

  const search = options.search?.trim() ?? ''

  const { data, error } = await client.rpc('list_storage_objects', {
    p_bucket_id: bucketId,
    p_prefix: prefix,
    p_limit: limit,
    p_offset: offset,
    p_sort_col: sortCol,
    p_sort_order: sortOrder,
    p_search: search,
  })

  if (error)
    throw error

  type RpcRow = Database['public']['Functions']['list_storage_objects']['Returns'][number]
  const rows: RpcRow[] = data ?? []

  const assets: StorageAsset[] = rows.map((row) => {
    const extension = extractExtension(row.name)
    const publicUrl = row.name
      ? client.storage.from(bucketId).getPublicUrl(row.name).data.publicUrl
      : null

    return {
      id: row.id,
      bucket_id: row.bucket_id,
      name: row.name.split('/').pop() ?? row.name,
      path: row.name,
      type: 'file' as const,
      size: row.size ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_accessed_at: row.last_accessed_at,
      metadata: null,
      mimeType: row.mimetype,
      extension,
      publicUrl,
    }
  })

  return { assets, totalCount: rows[0]?.total_count ?? 0, hasMore: rows.length === limit }
}

export interface StorageAsset {
  id: string | null
  bucket_id: string
  name: string
  path: string
  type: 'file' | 'folder'
  size: number
  created_at: string | null
  updated_at: string | null
  last_accessed_at: string | null
  metadata: FileObject['metadata']
  mimeType: string | null
  extension: string | null
  publicUrl: string | null
}

export interface DirectoryOptions {
  prefix?: string
  limit?: number
  sortBy?: {
    column: SortColumn
    order: SortOrder
  }
}

type StorageMetadata = (Record<string, unknown> & {
  size?: number | string
  contentLength?: number | string
  lastModified?: number
  mimetype?: string
}) | null

const DEFAULT_LIMIT = 100
const DEFAULT_SORT: Required<DirectoryOptions>['sortBy'] = {
  column: 'name',
  order: 'asc',
}

export async function listStorageDirectory(
  client: SupabaseClient<Database>,
  bucketId: StorageBucketId,
  options: DirectoryOptions = {},
): Promise<StorageAsset[]> {
  const prefix = normalizePrefix(options.prefix)
  const limit = options.limit ?? DEFAULT_LIMIT
  const sortBy = options.sortBy ?? DEFAULT_SORT
  const bucket = client.storage.from(bucketId)
  const entries: StorageAsset[] = []
  let page = 0

  while (true) {
    const bucketPrefix = prefix.length > 0 ? prefix : undefined
    const { data, error } = await bucket.list(bucketPrefix, {
      limit,
      offset: page * limit,
      sortBy,
    })

    if (error)
      throw error

    const batch = data ?? []

    if (batch.length === 0)
      break

    entries.push(...batch.map(item => toStorageAsset(client, bucketId, item, prefix)))

    if (batch.length < limit)
      break

    page++
  }

  return entries
}

/**
 * Parallel recursive fetch. Fires all folder expansions concurrently.
 * Calls `onBatch` as each batch of files resolves so the UI can stream results in.
 */
export async function listStorageFilesRecursiveParallel(
  client: SupabaseClient<Database>,
  bucketId: StorageBucketId,
  prefix: string = '',
  onBatch?: (files: StorageAsset[]) => void,
): Promise<StorageAsset[]> {
  const directoryEntries = await listStorageDirectory(client, bucketId, { prefix })

  const immediateFiles = directoryEntries.filter(e => e.type === 'file')
  if (immediateFiles.length > 0)
    onBatch?.(immediateFiles)

  const folders = directoryEntries.filter(e => e.type === 'folder')

  const nestedResults = await Promise.all(
    folders.map(async f => listStorageFilesRecursiveParallel(client, bucketId, f.path, onBatch)),
  )

  return [...immediateFiles, ...nestedResults.flat()]
}

export async function listStorageFilesRecursive(
  client: SupabaseClient<Database>,
  bucketId: StorageBucketId,
  prefix: string = '',
): Promise<StorageAsset[]> {
  const directoryEntries = await listStorageDirectory(client, bucketId, { prefix })
  const files: StorageAsset[] = []

  for (const entry of directoryEntries) {
    if (entry.type === 'folder') {
      const nestedFiles = await listStorageFilesRecursive(client, bucketId, entry.path)
      files.push(...nestedFiles)
    }
    else {
      files.push(entry)
    }
  }

  return files
}

export function normalizePrefix(prefix?: string | null): string {
  if (prefix == null || prefix.length === 0)
    return ''

  return prefix
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
    .join('/')
}

export function joinAssetPath(prefix: string, name: string): string {
  const normalizedPrefix = normalizePrefix(prefix)
  if (normalizedPrefix.length === 0)
    return name
  if (name.length === 0)
    return normalizedPrefix
  return `${normalizedPrefix}/${name}`
}

export function formatBytes(size: number, decimals: number = 1): string {
  if (!Number.isFinite(size) || size <= 0)
    return '0 B'

  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(size) / Math.log(k))
  const normalizedIndex = Math.min(index, units.length - 1)
  const value = size / k ** normalizedIndex

  return `${value.toFixed(decimals)} ${units[normalizedIndex]}`
}

export function isImageAsset(asset: StorageAsset): boolean {
  const mime = asset.mimeType ?? ''
  const extension = asset.extension ?? ''
  if (mime.startsWith('image/'))
    return true

  const knownImageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']
  return knownImageExtensions.includes(extension)
}

export function isVideoAsset(asset: StorageAsset): boolean {
  const mime = asset.mimeType ?? ''
  const extension = asset.extension ?? ''
  if (mime.startsWith('video/'))
    return true

  const knownVideoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v']
  return knownVideoExtensions.includes(extension)
}

export function isAudioAsset(asset: StorageAsset): boolean {
  const mime = asset.mimeType ?? ''
  const extension = asset.extension ?? ''
  if (mime.startsWith('audio/'))
    return true

  const knownAudioExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'oga', 'opus', 'weba', 'wma']
  return knownAudioExtensions.includes(extension)
}

export function isArchiveAsset(asset: StorageAsset): boolean {
  const mime = asset.mimeType ?? ''
  const extension = asset.extension ?? ''
  if (ARCHIVE_MIME_TYPES.includes(mime))
    return true

  return ARCHIVE_EXTENSIONS.includes(extension)
}

export function isTextAsset(asset: StorageAsset): boolean {
  const mime = asset.mimeType ?? ''
  const extension = asset.extension ?? ''
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml')
    return true

  const knownTextExtensions = ['txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'log', 'sh', 'ts', 'js', 'css', 'html', 'htm', 'svg']
  return knownTextExtensions.includes(extension)
}

export function getPublicAssetUrl(
  client: SupabaseClient<Database>,
  bucketId: StorageBucketId,
  path: string,
): string | null {
  const normalized = normalizePrefix(path)
  if (!normalized)
    return null
  return client.storage.from(bucketId).getPublicUrl(normalized).data.publicUrl
}

/**
 * Triggers a browser download for a storage asset. Appends Supabase's
 * `?download` query param so the response is served with a
 * `Content-Disposition: attachment` header even when the asset is cross-origin.
 */
export function downloadAsset(publicUrl: string | null | undefined, fileName: string): void {
  if (!import.meta.client || !publicUrl)
    return

  const url = new URL(publicUrl)
  url.searchParams.set('download', fileName)

  triggerDownload(url.toString(), fileName)
}

export function getBucketLabel(bucketId: StorageBucketId): string {
  switch (bucketId) {
    case CMS_BUCKET_ID:
      return 'CMS'
    case FORUMS_BUCKET_ID:
      return 'Forums'
    case STATIC_BUCKET_ID:
      return 'Static'
    case USERS_BUCKET_ID:
      return 'Users'
    default:
      return bucketId
  }
}

export function getBucketDescription(bucketId: StorageBucketId): string {
  switch (bucketId) {
    case CMS_BUCKET_ID:
      return 'Shared CMS assets'
    case FORUMS_BUCKET_ID:
      return 'Discussion uploads'
    case STATIC_BUCKET_ID:
      return 'Site static assets'
    case USERS_BUCKET_ID:
      return 'User avatars & profile media'
    default:
      return ''
  }
}

export function getBucketOptions() {
  return ([
    { label: getBucketLabel(CMS_BUCKET_ID), value: CMS_BUCKET_ID },
    { label: getBucketLabel(FORUMS_BUCKET_ID), value: FORUMS_BUCKET_ID },
    { label: getBucketLabel(STATIC_BUCKET_ID), value: STATIC_BUCKET_ID },
    { label: getBucketLabel(USERS_BUCKET_ID), value: USERS_BUCKET_ID },
  ]) satisfies Array<{ label: string, value: StorageBucketId }>
}

function toStorageAsset(
  client: SupabaseClient<Database>,
  bucketId: StorageBucketId,
  item: FileObject,
  prefix: string,
): StorageAsset {
  const path = joinAssetPath(prefix, item.name)
  const isFolder = item.id === null || item.metadata === null
  const metadata = (item.metadata ?? null) as StorageMetadata
  const mimeType = isFolder ? null : metadata?.mimetype ?? null
  const extension = isFolder ? null : extractExtension(item.name)
  const size = isFolder ? 0 : resolveSize(metadata)
  const publicUrl = (!isFolder && path.length > 0)
    ? client.storage.from(bucketId).getPublicUrl(path).data.publicUrl
    : null

  return {
    id: item.id,
    bucket_id: item.bucket_id ?? bucketId,
    name: item.name,
    path,
    type: isFolder ? 'folder' : 'file',
    size,
    created_at: item.created_at ?? null,
    updated_at: item.updated_at ?? null,
    last_accessed_at: item.last_accessed_at ?? null,
    metadata: metadata as FileObject['metadata'],
    mimeType,
    extension,
    publicUrl,
  }
}

export function extractExtension(filename: string): string | null {
  const parts = filename.split('.')
  if (parts.length < 2)
    return null
  return parts.pop()?.toLowerCase() ?? null
}

function resolveSize(metadata: StorageMetadata): number {
  if (!metadata)
    return 0

  const numericFields: Array<unknown> = [metadata.size, metadata.contentLength]
  for (const field of numericFields) {
    const parsed = parseNumericField(field)
    if (parsed !== null)
      return parsed
  }

  const lastModified = metadata.lastModified
  if (typeof lastModified === 'number' && Number.isFinite(lastModified))
    return lastModified

  return 0
}

function parseNumericField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed))
      return parsed
  }
  return null
}

/**
 * Given an array of public asset URLs, creates a ZIP archive and triggers a download in the browser.
 *
 */
export async function zipAndDownloadAssets(publicPaths: string[], archiveName: string) {
  const zip = new JSZip()

  // Fetch all files and add them to the zip
  await Promise.all(
    publicPaths.map(async (path) => {
      const fileBlob = await fetch(path).then(async res => res.blob())
      const fileName = path.split('/').pop() ?? 'file'
      zip.file(fileName, fileBlob)
    }),
  )

  const mainBlob = await zip.generateAsync({ type: 'blob' })
  const archiveHref = URL.createObjectURL(mainBlob)

  triggerDownload(archiveHref, archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`)
}

function triggerDownload(url: string, fileName: string) {
  if (!import.meta.client)
    return

  const anchor = document.createElement('a')
  anchor.classList.add('visually-hidden')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
