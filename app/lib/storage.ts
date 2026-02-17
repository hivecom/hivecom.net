/**
 * Storage utilities for handling file uploads to Supabase Storage
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export interface UploadResult {
  success: boolean
  url?: string
  error?: string
}

const PROJECT_BANNER_BUCKET = 'hivecom-content-static'
const PROJECT_BANNER_PREFIX = 'projects'
const PROJECT_BANNER_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const

function normalizeProjectId(projectId: number | string): number {
  const normalized = Number(projectId)
  if (!Number.isFinite(normalized))
    throw new Error('Invalid project id')
  return normalized
}

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
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Please select a valid image file (JPEG, PNG, or WebP)',
    }
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024 // 5MB in bytes
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size must be less than 5MB',
    }
  }

  return { valid: true }
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
            const webpFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), {
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

    // Convert to WebP for consistency and better compression
    let processedFile: File
    try {
      processedFile = await convertImageToWebP(file, 0.85)
    }
    catch (conversionError) {
      console.warn('Failed to convert avatar to WebP, using original file:', conversionError)
      processedFile = file
    }

    // Upload to user's folder with the filename 'avatar.webp' (or original extension if conversion failed)
    const fileExtension = processedFile.type === 'image/webp' ? 'webp' : 'png'
    const filePath = `${userId}/avatar.${fileExtension}`

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

    // Get the public URL
    const { data: urlData } = supabaseClient.storage
      .from('hivecom-content-users')
      .getPublicUrl(filePath)

    // Invalidate cached avatar URL since we uploaded a new one
    invalidateAvatarCache(userId)

    // Dispatch avatar updated event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('avatar-updated', {
        detail: { userId, url: urlData.publicUrl },
      }))
    }

    return {
      success: true,
      url: urlData.publicUrl,
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
    // Common image extensions to try, in order of preference (WebP first for new uploads)
    const extensions = ['webp', 'png', 'jpg', 'jpeg']

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

function buildProjectBannerPath(projectId: number, extension: string) {
  return `${PROJECT_BANNER_PREFIX}/${projectId}/banner.${extension}`
}

function dispatchProjectBannerUpdated(projectId: number, url: string | null) {
  if (typeof window === 'undefined')
    return

  window.dispatchEvent(new CustomEvent('project-banner-updated', {
    detail: { projectId, url },
  }))
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
    // Common image extensions to try (WebP first for new uploads)
    const extensions = ['webp', 'png', 'jpg', 'jpeg']

    for (const extension of extensions) {
      const filePath = `${userId}/avatar.${extension}`

      // Check if file exists by trying to get its metadata
      const { data, error: listError } = await supabaseClient.storage
        .from('hivecom-content-users')
        .list(userId, {
          search: `avatar.${extension}`,
        })

      if (listError === null && data !== null && data.length > 0) {
        // File exists, delete it
        const { error } = await supabaseClient.storage
          .from('hivecom-content-users')
          .remove([filePath])

        if (error) {
          console.error('Error deleting avatar:', error)
          return { success: false, error: error.message }
        }

        // Invalidate cached avatar URL since we deleted it
        invalidateAvatarCache(userId)

        // Dispatch avatar deleted event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('avatar-updated', {
            detail: { userId, url: null },
          }))
        }

        return { success: true }
      }
    }

    // No avatar found with any extension - this might be intentional
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
