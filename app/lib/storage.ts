/**
 * Storage utilities for handling file uploads to Supabase Storage
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { dispatchAvatarUpdated } from '@/composables/useAvatarBus'
import { buildProjectBannerPath, dispatchProjectBannerUpdated, normalizeProjectId, PROJECT_BANNER_BUCKET, PROJECT_BANNER_EXTENSIONS, PROJECT_BANNER_PREFIX } from '@/lib/projectBanner'

const FILE_EXTENSION_RE = /\.[^/.]+$/

export interface UploadResult {
  success: boolean
  url?: string
  error?: string
}

export const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
export const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg']
export const allowedMediaTypes = [...allowedImageTypes, ...allowedVideoTypes]
export const allowedMediaExtensions = allowedMediaTypes.join(', ')

export const allowedDataTypes = ['text/csv', 'application/json', 'text/plain']
export const allowedDataExtensions = '.csv,.json'

function isStorageNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object')
    return false

  const candidate = error as { statusCode?: number, message?: string }
  if (typeof candidate.statusCode === 'number' && candidate.statusCode === 404)
    return true

  if (typeof candidate.message === 'string') {
    return candidate.message.includes('No such file or directory')
      || candidate.message.toLowerCase().includes('not found')
  }

  return false
}

/**
 * Validates if a file is a valid image
 */
export function validateImageFile(file: File): { valid: boolean, error?: string } {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Please select a valid image file (JPEG, PNG, WebP, or GIF)',
    }
  }

  // Check file size (max 1MB - matches hivecom-content-users bucket limit)
  const maxSize = 1 * 1024 * 1024 // 1MB in bytes
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size must be less than 1MB',
    }
  }

  return { valid: true }
}

/**
 * Strips EXIF and other metadata from an image by re-drawing it through a
 * canvas element. Preserves the original mime type and dimensions.
 * Falls back to the original file if the browser cannot create a canvas blob
 * (e.g. SVG or other non-raster formats).
 */
export async function stripImageMetadata(file: File): Promise<File> {
  // Canvas round-tripping a GIF produces a static single frame - pass through unchanged.
  if (file.type === 'image/gif')
    return file

  return new Promise((resolve) => {
    const img = new Image()

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)

      // Preserve the original mime type so PNG stays PNG, JPEG stays JPEG, etc.
      const outputType = file.type === 'image/jpg' ? 'image/jpeg' : file.type

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src)
          if (blob) {
            resolve(new File([blob], file.name, {
              type: outputType,
              lastModified: Date.now(),
            }))
          }
          else {
            // Canvas couldn't produce a blob - fall back to original
            resolve(file)
          }
        },
        outputType,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      // Can't load the image - just pass it through unchanged
      resolve(file)
    }

    img.src = URL.createObjectURL(file)
  })
}

/**
 * Converts an image file to WebP format
 */
export async function convertImageToWebP(file: File, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      // Set canvas size to image size
      canvas.width = img.width
      canvas.height = img.height

      // Draw image to canvas
      ctx?.drawImage(img, 0, 0)

      // Convert to WebP blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create new File with WebP format
            const webpFile = new File([blob], file.name.replace(FILE_EXTENSION_RE, '.webp'), {
              type: 'image/webp',
              lastModified: Date.now(),
            })
            resolve(webpFile)
          }
          else {
            reject(new Error('Failed to convert image to WebP'))
          }
        },
        'image/webp',
        quality,
      )
    }

    img.onerror = () => reject(new Error('Failed to load image for conversion'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Uploads a user's avatar to the storage bucket
 * Automatically converts images to WebP format for consistency and optimization
 */
export async function uploadUserAvatar(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  file: File,
): Promise<UploadResult> {
  try {
    // Validate the file first
    const validation = validateImageFile(file)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // GIFs are kept as-is to preserve animation; all other formats convert to WebP
    let processedFile: File
    if (file.type === 'image/gif') {
      processedFile = file
    }
    else {
      try {
        processedFile = await convertImageToWebP(file, 0.85)
      }
      catch (conversionError) {
        console.warn('Failed to convert avatar to WebP, using original file:', conversionError)
        processedFile = file
      }
    }

    // Determine extension: gif stays gif, webp for converted, png as fallback
    let fileExtension: string
    if (processedFile.type === 'image/gif') {
      fileExtension = 'gif'
    }
    else if (processedFile.type === 'image/webp') {
      fileExtension = 'webp'
    }
    else {
      fileExtension = 'png'
    }
    const filePath = `${userId}/avatar.${fileExtension}`

    // Delete any existing avatar files with other extensions so stale files
    // don't get served after an extension change (e.g. jpg → gif).
    const otherExtensions = ['webp', 'gif', 'png', 'jpg', 'jpeg'].filter(e => e !== fileExtension)
    const staleFiles = (
      await Promise.all(
        otherExtensions.map(async (ext) => {
          const { data } = await supabaseClient.storage
            .from('hivecom-content-users')
            .list(userId, { search: `avatar.${ext}` })
          return data && data.length > 0 ? `${userId}/avatar.${ext}` : null
        }),
      )
    ).filter((f): f is string => f !== null)

    if (staleFiles.length > 0) {
      await supabaseClient.storage.from('hivecom-content-users').remove(staleFiles)
    }

    const { error } = await supabaseClient.storage
      .from('hivecom-content-users')
      .upload(filePath, processedFile, {
        upsert: true, // Replace existing file
        contentType: processedFile.type,
      })

    if (error) {
      console.error('Error uploading avatar:', error)
      return { success: false, error: error.message }
    }

    // Get the public URL with a cache-busting timestamp so the browser doesn't
    // serve the old avatar from its HTTP cache (same filename, upserted in place).
    const { data: urlData } = supabaseClient.storage
      .from('hivecom-content-users')
      .getPublicUrl(filePath)

    const bustUrl = `${urlData.publicUrl}?t=${Date.now()}`

    // Invalidate cached avatar URL since we uploaded a new one
    invalidateAvatarCache(userId)

    // Store the cache-busted URL directly in localStorage so the next
    // getUserAvatarUrl call (triggered by the avatar-updated bus) serves
    // the fresh image instead of reconstructing the clean URL, which the
    // browser would serve from its HTTP cache (same filename, upserted).
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`avatar:${userId}`, JSON.stringify({
          url: bustUrl,
          timestamp: Date.now(),
        }))
      }
      catch {
        // localStorage full - ignore
      }
    }

    // Update profiles table with the new avatar extension
    await supabaseClient.from('profiles').update({ avatar_extension: fileExtension }).eq('id', userId)

    // Dispatch avatar updated event
    dispatchAvatarUpdated({ userId, url: bustUrl })

    return {
      success: true,
      url: bustUrl,
    }
  }
  catch (error) {
    console.error('Error uploading avatar:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Gets the public URL for a user's avatar
 * Tries multiple common extensions to find the avatar, prioritizing WebP
 * Results are cached to avoid repeated storage API calls
 */
export async function getUserAvatarUrl(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  avatarExtension?: string | null,
): Promise<string | null> {
  // Use a simple in-memory cache for avatar URLs
  const cacheKey = `avatar:${userId}`
  const cacheTTL = 60 * 60 * 1000 // 1 hour cache

  // Check if we have a cached result
  if (typeof window !== 'undefined') {
    const cached = window.localStorage.getItem(cacheKey)
    if (cached !== null && cached.length > 0) {
      try {
        const parsed = JSON.parse(cached) as { url: string | null, timestamp: number }
        const { url, timestamp } = parsed
        const isExpired = Date.now() - timestamp > cacheTTL

        if (!isExpired) {
          return url
        }
      }
      catch {
        // Invalid cache entry, remove it
        window.localStorage.removeItem(cacheKey)
      }
    }
  }

  try {
    // Fast-path: if extension is known, skip storage list() calls entirely
    if (avatarExtension != null && avatarExtension.length > 0) {
      const avatarUrl = supabaseClient.storage
        .from('hivecom-content-users')
        .getPublicUrl(`${userId}/avatar.${avatarExtension}`)
        .data
        .publicUrl

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify({
            url: avatarUrl,
            timestamp: Date.now(),
          }))
        }
        catch {
          // localStorage might be full, ignore cache errors
        }
      }

      return avatarUrl
    }

    // Common image extensions to try, in order of preference (WebP first for new uploads)
    const extensions = ['webp', 'gif', 'png', 'jpg', 'jpeg']

    for (const extension of extensions) {
      const filePath = `${userId}/avatar.${extension}`

      // Check if file exists by trying to get its metadata
      const { data, error } = await supabaseClient.storage
        .from('hivecom-content-users')
        .list(userId, {
          search: `avatar.${extension}`,
        })

      if (error === null && data !== null && data.length > 0) {
        // File exists, return the public URL
        const { data: urlData } = supabaseClient.storage
          .from('hivecom-content-users')
          .getPublicUrl(filePath)

        const avatarUrl = urlData.publicUrl

        // Cache the result
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify({
              url: avatarUrl,
              timestamp: Date.now(),
            }))
          }
          catch {
            // localStorage might be full, ignore cache errors
          }
        }

        return avatarUrl
      }
    }

    // No avatar found with any extension - cache this result too
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify({
          url: null,
          timestamp: Date.now(),
        }))
      }
      catch {
        // localStorage might be full, ignore cache errors
      }
    }

    return null
  }
  catch (error) {
    console.error('Error getting avatar URL:', error)
    return null
  }
}

/**
 * Invalidates the cached avatar URL for a user
 * Should be called when avatar is uploaded or deleted
 */
export function invalidateAvatarCache(userId: string): void {
  if (typeof window !== 'undefined') {
    const cacheKey = `avatar:${userId}`
    window.localStorage.removeItem(cacheKey)
  }
}

// ── Topic Icon Storage ────────────────────────────────────────────────────────

const TOPIC_ICON_BUCKET = 'hivecom-content-forums'

/**
 * Uploads a topic icon to the forums storage bucket.
 * Stored at `topics/<topicId>/icon.webp`.
 * Automatically converts images to WebP format.
 */
export async function uploadTopicIcon(
  supabaseClient: SupabaseClient<Database>,
  topicId: string,
  file: File,
): Promise<UploadResult> {
  try {
    const validation = validateImageFile(file)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    let processedFile: File = file
    try {
      processedFile = await convertImageToWebP(file)
    }
    catch (conversionError) {
      console.warn('Failed to convert topic icon to WebP, using original file:', conversionError)
      processedFile = file
    }

    const fileExtension = processedFile.type === 'image/webp' ? 'webp' : 'png'
    const filePath = `topics/${topicId}/icon.${fileExtension}`

    const { error } = await supabaseClient.storage
      .from(TOPIC_ICON_BUCKET)
      .upload(filePath, processedFile, {
        upsert: true,
        contentType: processedFile.type,
      })

    if (error) {
      console.error('Error uploading topic icon:', error)
      return { success: false, error: error.message }
    }

    const { data: urlData } = supabaseClient.storage
      .from(TOPIC_ICON_BUCKET)
      .getPublicUrl(filePath)

    return {
      success: true,
      url: urlData.publicUrl,
    }
  }
  catch (error) {
    console.error('Error uploading topic icon:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Gets the public URL for a topic's icon.
 * Lists the topic's folder once and picks the best available extension.
 * This is a pure fetch — caching is handled by the useTopicIcon composable.
 */
export async function getTopicIconUrl(
  supabaseClient: SupabaseClient<Database>,
  topicId: string,
): Promise<string | null> {
  try {
    const folder = `topics/${topicId}`
    // Preferred extension order — one list() call covers all of them
    const preferredOrder = ['icon.webp', 'icon.png', 'icon.jpg', 'icon.jpeg']

    const { data, error } = await supabaseClient.storage
      .from(TOPIC_ICON_BUCKET)
      .list(folder)

    if (error !== null || data === null)
      return null

    const fileNames = new Set(data.map(f => f.name))
    const found = preferredOrder.find(name => fileNames.has(name))

    if (found == null)
      return null

    const { data: urlData } = supabaseClient.storage
      .from(TOPIC_ICON_BUCKET)
      .getPublicUrl(`${folder}/${found}`)

    return urlData.publicUrl
  }
  catch (error) {
    console.error('Error getting topic icon URL:', error)
    return null
  }
}

/**
 * Deletes a topic's icon from storage.
 * Tries all common extensions to find and remove the file.
 */
export async function deleteTopicIcon(
  supabaseClient: SupabaseClient<Database>,
  topicId: string,
): Promise<{ success: boolean, error?: string }> {
  try {
    const extensions = ['webp', 'png', 'jpg', 'jpeg']
    const folder = `topics/${topicId}`

    for (const extension of extensions) {
      const filePath = `${folder}/icon.${extension}`

      const { data, error: listError } = await supabaseClient.storage
        .from(TOPIC_ICON_BUCKET)
        .list(folder, {
          search: `icon.${extension}`,
        })

      if (listError !== null || data === null || data.length === 0)
        continue

      const { error } = await supabaseClient.storage
        .from(TOPIC_ICON_BUCKET)
        .remove([filePath])

      if (error) {
        console.error('Error deleting topic icon:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    }

    // No icon found - nothing to delete
    return { success: true }
  }
  catch (error) {
    console.error('Error deleting topic icon:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Uploads a game asset (icon, cover, or background)
 * Automatically converts images to WebP format for consistency and optimization
 */
export async function uploadGameAsset(
  supabaseClient: SupabaseClient<Database>,
  gameShorthand: string,
  assetType: 'icon' | 'cover' | 'background',
  file: File,
): Promise<UploadResult> {
  try {
    // Validate the file first
    const validation = validateImageFile(file)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Convert to WebP for consistency and better compression
    let processedFile: File
    try {
      processedFile = await convertImageToWebP(file, 0.85)
    }
    catch (conversionError) {
      console.warn('Failed to convert to WebP, using original file:', conversionError)
      processedFile = file
    }

    // Create the file path: games/{shorthand}/{assetType}.webp (or original extension if conversion failed)
    const fileExtension = processedFile.type === 'image/webp' ? 'webp' : file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const filePath = `games/${gameShorthand}/${assetType}.${fileExtension}`

    const { error } = await supabaseClient.storage
      .from('hivecom-content-static')
      .upload(filePath, processedFile, {
        upsert: true, // Replace existing file
        contentType: processedFile.type,
      })

    if (error) {
      console.error('Error uploading game asset:', error)
      return { success: false, error: error.message }
    }

    // Get the public URL
    const { data: urlData } = supabaseClient.storage
      .from('hivecom-content-static')
      .getPublicUrl(filePath)

    return {
      success: true,
      url: urlData.publicUrl,
    }
  }
  catch (error) {
    console.error('Error uploading game asset:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Gets the public URL for a game asset
 * Tries multiple common extensions to find the asset, prioritizing WebP
 */
export async function getGameAssetUrl(
  supabaseClient: SupabaseClient<Database>,
  gameShorthand: string,
  assetType: 'icon' | 'cover' | 'background',
): Promise<string | null> {
  try {
    // Common image extensions to try, in order of preference (WebP first for new uploads)
    const extensions = ['webp', 'png', 'jpg', 'jpeg']

    for (const extension of extensions) {
      const filePath = `games/${gameShorthand}/${assetType}.${extension}`

      // Check if file exists by trying to get its metadata
      const { data, error } = await supabaseClient.storage
        .from('hivecom-content-static')
        .list(`games/${gameShorthand}`, {
          search: `${assetType}.${extension}`,
        })

      if (error === null && data !== null && data.length > 0) {
        // File exists, return the public URL
        const { data: urlData } = supabaseClient.storage
          .from('hivecom-content-static')
          .getPublicUrl(filePath)

        return urlData.publicUrl
      }
    }

    // No file found with any extension
    return null
  }
  catch (error) {
    console.error('Error getting game asset URL:', error)
    return null
  }
}

/**
 * Deletes a game asset from storage
 * Tries multiple common extensions to find and delete the asset, prioritizing WebP
 */
export async function deleteGameAsset(
  supabaseClient: SupabaseClient<Database>,
  gameShorthand: string,
  assetType: 'icon' | 'cover' | 'background',
): Promise<{ success: boolean, error?: string }> {
  try {
    // Common image extensions to try (WebP first for new uploads)
    const extensions = ['webp', 'png', 'jpg', 'jpeg']

    for (const extension of extensions) {
      const filePath = `games/${gameShorthand}/${assetType}.${extension}`

      // Check if file exists by trying to get its metadata
      const { data, error: listError } = await supabaseClient.storage
        .from('hivecom-content-static')
        .list(`games/${gameShorthand}`, {
          search: `${assetType}.${extension}`,
        })

      if (listError === null && data !== null && data.length > 0) {
        // File exists, delete it
        const { error } = await supabaseClient.storage
          .from('hivecom-content-static')
          .remove([filePath])

        if (error) {
          console.error('Error deleting game asset:', error)
          return { success: false, error: error.message }
        }

        return { success: true }
      }
    }

    // No file found with any extension - this might be intentional
    return { success: true }
  }
  catch (error) {
    console.error('Error deleting game asset:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function uploadProjectBanner(
  supabaseClient: SupabaseClient<Database>,
  projectId: number,
  file: File,
): Promise<UploadResult> {
  try {
    const validation = validateImageFile(file)
    if (!validation.valid)
      return { success: false, error: validation.error }

    let processedFile: File
    try {
      processedFile = await convertImageToWebP(file, 0.9)
    }
    catch (conversionError) {
      console.warn('Failed to convert project banner to WebP, using original file:', conversionError)
      processedFile = file
    }

    const normalizedProjectId = normalizeProjectId(projectId)
    const extension = processedFile.type === 'image/webp'
      ? 'webp'
      : (processedFile.name.split('.').pop()?.toLowerCase() ?? 'png')

    // Remove existing banner variants silently to avoid stale files
    const cleanupResult = await deleteProjectBanner(supabaseClient, normalizedProjectId, { silent: true })

    if (!cleanupResult.success && typeof cleanupResult.error === 'string' && cleanupResult.error.length > 0) {
      console.warn('Failed to remove legacy project banners before upload:', cleanupResult.error)
    }

    const filePath = buildProjectBannerPath(normalizedProjectId, extension)
    const { error } = await supabaseClient.storage
      .from(PROJECT_BANNER_BUCKET)
      .upload(filePath, processedFile, {
        upsert: true,
        contentType: processedFile.type,
      })

    if (error) {
      console.error('Error uploading project banner:', error)
      return { success: false, error: error.message }
    }

    const { data: urlData } = supabaseClient.storage
      .from(PROJECT_BANNER_BUCKET)
      .getPublicUrl(filePath)

    dispatchProjectBannerUpdated(normalizedProjectId, urlData.publicUrl)

    return {
      success: true,
      url: urlData.publicUrl,
    }
  }
  catch (error) {
    console.error('Error uploading project banner:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function getProjectBannerUrl(
  supabaseClient: SupabaseClient<Database>,
  projectId: number,
): Promise<string | null> {
  try {
    const normalizedProjectId = normalizeProjectId(projectId)
    const prefix = `${PROJECT_BANNER_PREFIX}/${normalizedProjectId}`
    const bucket = supabaseClient.storage.from(PROJECT_BANNER_BUCKET)

    const { data, error } = await bucket.list(prefix)

    if (error) {
      if (isStorageNotFoundError(error))
        return null
      throw error
    }

    const files = data ?? []
    for (const extension of PROJECT_BANNER_EXTENSIONS) {
      const targetName = `banner.${extension}`
      if (files.some(file => file.name === targetName)) {
        const filePath = buildProjectBannerPath(normalizedProjectId, extension)
        const { data: urlData } = bucket.getPublicUrl(filePath)
        return urlData.publicUrl
      }
    }

    return null
  }
  catch (error) {
    console.error('Error loading project banner:', error)
    throw error instanceof Error ? error : new Error('Failed to load project banner')
  }
}

export async function deleteProjectBanner(
  supabaseClient: SupabaseClient<Database>,
  projectId: number,
  options: { silent?: boolean } = {},
): Promise<{ success: boolean, error?: string }> {
  try {
    const normalizedProjectId = normalizeProjectId(projectId)
    const prefix = `${PROJECT_BANNER_PREFIX}/${normalizedProjectId}`
    const bucket = supabaseClient.storage.from(PROJECT_BANNER_BUCKET)
    const { data, error } = await bucket.list(prefix)

    if (error) {
      if (isStorageNotFoundError(error))
        return { success: true }

      console.error('Error listing project banners:', error)
      return { success: false, error: error.message }
    }

    const files = (data ?? []).filter(file => file.name.startsWith('banner.'))

    if (files.length === 0) {
      if (!options.silent)
        dispatchProjectBannerUpdated(normalizedProjectId, null)
      return { success: true }
    }

    const targets = files.map(file => `${prefix}/${file.name}`)
    const { error: removeError } = await bucket.remove(targets)

    if (removeError) {
      console.error('Error deleting project banner:', removeError)
      return { success: false, error: removeError.message }
    }

    if (!options.silent)
      dispatchProjectBannerUpdated(normalizedProjectId, null)

    return { success: true }
  }
  catch (error) {
    console.error('Error deleting project banner:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Deletes a user's avatar from storage
 * Tries multiple common extensions to find and delete the avatar, prioritizing WebP
 */
export async function deleteUserAvatar(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
): Promise<{ success: boolean, error?: string }> {
  try {
    // Find and delete ALL avatar files regardless of extension - stale files
    // from previous uploads (e.g. old jpg when current is gif) must all go.
    const extensions = ['webp', 'gif', 'png', 'jpg', 'jpeg']

    const filesToDelete = (
      await Promise.all(
        extensions.map(async (ext) => {
          const { data, error: listError } = await supabaseClient.storage
            .from('hivecom-content-users')
            .list(userId, { search: `avatar.${ext}` })
          if (listError === null && data !== null && data.length > 0)
            return `${userId}/avatar.${ext}`
          return null
        }),
      )
    ).filter((f): f is string => f !== null)

    if (filesToDelete.length === 0) {
      // No avatar found - still clear the profile column in case it's stale
      await supabaseClient.from('profiles').update({ avatar_extension: null }).eq('id', userId)
      return { success: true }
    }

    const { error } = await supabaseClient.storage
      .from('hivecom-content-users')
      .remove(filesToDelete)

    if (error) {
      console.error('Error deleting avatar:', error)
      return { success: false, error: error.message }
    }

    // Invalidate cached avatar URL since we deleted it
    invalidateAvatarCache(userId)

    // Clear avatar_extension in profiles table
    await supabaseClient.from('profiles').update({ avatar_extension: null }).eq('id', userId)

    // Dispatch avatar deleted event
    dispatchAvatarUpdated({ userId, url: null })

    return { success: true }
  }
  catch (error) {
    console.error('Error deleting avatar:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
