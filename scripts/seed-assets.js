#!/usr/bin/env node

/**
 * Uploads private assets to local Supabase storage after a db reset.
 *
 * Game assets in private/gameservers/ are mapped to the hivecom-content-static bucket
 * under games/{shorthand}/{assetType}.{ext} - matching the paths that
 * getGameAssetUrl() in app/lib/storage.ts resolves.
 *
 * File naming convention in private/gameservers/:
 *   {shorthand}-card.{ext}  -> games/{shorthand}/cover.{ext}
 *   {shorthand}-hero.{ext}  -> games/{shorthand}/background.{ext}
 *
 * User avatars in private/profile/ are mapped to the hivecom-content-users bucket
 * under {userId}/avatar.{ext} - matching the paths that getUserAvatarUrl() resolves.
 *
 * File naming convention in private/profile/:
 *   {username}.{ext}  -> {userId}/avatar.{ext}
 *   (username is looked up against the local DB to resolve the user ID)
 *
 * Run via: npm run reset  (db reset + this script)
 */

import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Local Supabase always binds to these values - they are not secret.
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const STATIC_BUCKET = 'hivecom-content-static'
const USERS_BUCKET = 'hivecom-content-users'

const ASSET_TYPE_MAP = {
  card: 'cover',
  hero: 'background',
  icon: 'icon',
}

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const GAMESERVERS_DIR = join(__dirname, '..', 'private', 'gameservers')
const PROFILE_DIR = join(__dirname, '..', 'private', 'profile')

// ── Game assets ───────────────────────────────────────────────────────────────

async function uploadGameAssets(supabase) {
  let files
  try {
    files = await readdir(GAMESERVERS_DIR)
  }
  catch {
    console.warn(`Skipping game assets - could not read directory: ${GAMESERVERS_DIR}`)
    return { success: 0, fail: 0 }
  }

  const uploads = files
    .map((filename) => {
      const ext = extname(filename).toLowerCase()
      const stem = filename.slice(0, -ext.length)

      const dashIdx = stem.lastIndexOf('-')
      if (dashIdx === -1)
        return null

      const shorthand = stem.slice(0, dashIdx)
      const suffix = stem.slice(dashIdx + 1)
      const assetType = ASSET_TYPE_MAP[suffix]
      const mimeType = MIME_MAP[ext]

      if (!assetType) {
        console.warn(`  Skipping "${filename}" - unknown suffix "${suffix}" (expected: ${Object.keys(ASSET_TYPE_MAP).join(', ')})`)
        return null
      }
      if (!mimeType) {
        console.warn(`  Skipping "${filename}" - unsupported extension "${ext}"`)
        return null
      }

      return { filename, shorthand, assetType, ext, mimeType }
    })
    .filter(Boolean)

  if (uploads.length === 0) {
    console.log('No game assets found to upload.')
    return { success: 0, fail: 0 }
  }

  console.log(`Uploading ${uploads.length} game asset(s) to "${STATIC_BUCKET}"...\n`)

  let success = 0
  let fail = 0

  for (const { filename, shorthand, assetType, ext, mimeType } of uploads) {
    const storagePath = `games/${shorthand}/${assetType}${ext}`
    const localPath = join(GAMESERVERS_DIR, filename)

    process.stdout.write(`  ${filename} -> ${storagePath} ... `)

    try {
      const buffer = await readFile(localPath)
      const { error } = await supabase.storage
        .from(STATIC_BUCKET)
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

      if (error) {
        console.log(`FAIL (${error.message})`)
        fail++
      }
      else {
        console.log('OK')
        success++
      }
    }
    catch (err) {
      console.log(`FAIL (${err.message})`)
      fail++
    }
  }

  return { success, fail }
}

// ── User avatars ──────────────────────────────────────────────────────────────

async function uploadUserAvatars(supabase) {
  let files
  try {
    files = await readdir(PROFILE_DIR)
  }
  catch {
    console.warn(`Skipping user avatars - could not read directory: ${PROFILE_DIR}`)
    return { success: 0, fail: 0 }
  }

  const candidates = files
    .map((filename) => {
      const ext = extname(filename).toLowerCase()
      const username = filename.slice(0, -ext.length)
      const mimeType = MIME_MAP[ext]

      if (!mimeType) {
        console.warn(`  Skipping "${filename}" - unsupported extension "${ext}"`)
        return null
      }

      return { filename, username, ext, mimeType }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    console.log('No user avatars found to upload.')
    return { success: 0, fail: 0 }
  }

  // Resolve usernames to user IDs via the profiles table.
  const usernames = candidates.map(c => c.username)
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username')
    .or(usernames.map(u => `username.ilike.${u}`).join(','))

  if (profilesError) {
    console.error(`  Could not query profiles: ${profilesError.message}`)
    return { success: 0, fail: candidates.length }
  }

  const usernameToId = Object.fromEntries(
    (profiles ?? []).map(p => [p.username.toLowerCase(), p.id]),
  )

  console.log(`Uploading ${candidates.length} user avatar(s) to "${USERS_BUCKET}"...\n`)

  let success = 0
  let fail = 0

  for (const { filename, username, ext, mimeType } of candidates) {
    const userId = usernameToId[username]

    if (!userId) {
      console.log(`  ${filename} -> (no profile found for username "${username}") SKIP`)
      continue
    }

    const storagePath = `${userId}/avatar${ext}`
    const localPath = join(PROFILE_DIR, filename)

    process.stdout.write(`  ${filename} -> ${storagePath} ... `)

    try {
      const buffer = await readFile(localPath)
      const { error } = await supabase.storage
        .from(USERS_BUCKET)
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

      if (error) {
        console.log(`FAIL (${error.message})`)
        fail++
      }
      else {
        console.log('OK')
        success++
      }
    }
    catch (err) {
      console.log(`FAIL (${err.message})`)
      fail++
    }
  }

  return { success, fail }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  let totalSuccess = 0
  let totalFail = 0

  console.log()

  const gameResult = await uploadGameAssets(supabase)
  totalSuccess += gameResult.success
  totalFail += gameResult.fail

  console.log()

  const avatarResult = await uploadUserAvatars(supabase)
  totalSuccess += avatarResult.success
  totalFail += avatarResult.fail

  console.log(`\nDone. ${totalSuccess} uploaded, ${totalFail} failed.\n`)

  if (totalFail > 0)
    process.exit(1)
}

main()
