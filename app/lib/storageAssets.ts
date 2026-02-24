import type { FileObject } from '@supabase/storage-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export const CMS_BUCKET_ID = 'hivecom-cms' as const
export const FORUMS_BUCKET_ID = 'hivecom-content-forums' as const
export const STATIC_BUCKET_ID = 'hivecom-content-static' as const
export const USERS_BUCKET_ID = 'hivecom-content-users' as const

export type StorageBucketId
  = | typeof CMS_BUCKET_ID
    | typeof FORUMS_BUCKET_ID
    | typeof STATIC_BUCKET_ID
    | typeof USERS_BUCKET_ID

export type SortColumn = 'name' | 'updated_at' | 'created_at'
export type SortOrder = 'asc' | 'desc'

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
    bucket_id: item.bucket_id,
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

function extractExtension(filename: string): string | null {
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
