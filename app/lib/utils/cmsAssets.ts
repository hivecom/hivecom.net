import type { FileObject } from '@supabase/storage-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export const CMS_BUCKET_ID = 'hivecom-cms' as const

export type SortColumn = 'name' | 'updated_at' | 'created_at'
export type SortOrder = 'asc' | 'desc'

export interface CmsAsset {
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

export async function listCmsDirectory(
  client: SupabaseClient<Database>,
  options: DirectoryOptions = {},
): Promise<CmsAsset[]> {
  const prefix = normalizePrefix(options.prefix)
  const limit = options.limit ?? DEFAULT_LIMIT
  const sortBy = options.sortBy ?? DEFAULT_SORT
  const bucket = client.storage.from(CMS_BUCKET_ID)
  const entries: CmsAsset[] = []
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

    entries.push(...batch.map(item => toCmsAsset(client, item, prefix)))

    if (batch.length < limit)
      break

    page++
  }

  return entries
}

export async function listCmsFilesRecursive(
  client: SupabaseClient<Database>,
  prefix: string = '',
): Promise<CmsAsset[]> {
  const directoryEntries = await listCmsDirectory(client, { prefix })
  const files: CmsAsset[] = []

  for (const entry of directoryEntries) {
    if (entry.type === 'folder') {
      const nestedFiles = await listCmsFilesRecursive(client, entry.path)
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

export function isImageAsset(asset: CmsAsset): boolean {
  const mime = asset.mimeType ?? ''
  const extension = asset.extension ?? ''
  if (mime.startsWith('image/'))
    return true

  const knownImageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']
  return knownImageExtensions.includes(extension)
}

function toCmsAsset(
  client: SupabaseClient<Database>,
  item: FileObject,
  prefix: string,
): CmsAsset {
  const path = joinAssetPath(prefix, item.name)
  const isFolder = item.id === null || item.metadata === null
  const metadata = (item.metadata ?? null) as StorageMetadata
  const mimeType = isFolder ? null : metadata?.mimetype ?? null
  const extension = isFolder ? null : extractExtension(item.name)
  const size = isFolder ? 0 : resolveSize(metadata)
  const publicUrl = (!isFolder && path.length > 0)
    ? client.storage.from(CMS_BUCKET_ID).getPublicUrl(path).data.publicUrl
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
