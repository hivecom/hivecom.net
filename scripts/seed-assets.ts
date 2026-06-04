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
 * Metrics snapshot (metrics/latest.json in hivecom-content-static) is seeded
 * from the latest row in the local `metrics` table, normalized to the current
 * MetricsSnapshot schema in types/metrics.ts (legacy field names like
 * `members` are mapped to `users`, missing fields padded with empty defaults).
 * Typing here is enforced so schema drift in MetricsSnapshot is caught at
 * lint time rather than at runtime.
 *
 * Run via: npm run reset  (db reset + this script)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.ts'
import type { MetricsServerDetail, MetricsSnapshot, MetricsStorageBucket } from '../types/metrics.ts'
import { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'

import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Local Supabase always binds to these values - they are not secret.
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const STATIC_BUCKET = 'hivecom-content-static'
const USERS_BUCKET = 'hivecom-content-users'

const ASSET_TYPE_MAP: Record<string, string> = {
  card: 'cover',
  hero: 'background',
  icon: 'icon',
}

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const GAMESERVERS_DIR = join(__dirname, '..', 'private', 'gameservers')
const PROFILE_DIR = join(__dirname, '..', 'private', 'profile')

type Supabase = SupabaseClient<Database>

interface TaskResult {
  success: number
  fail: number
}

// ── Game assets ───────────────────────────────────────────────────────────────

interface GameAssetUpload {
  filename: string
  shorthand: string
  assetType: string
  ext: string
  mimeType: string
}

async function uploadGameAssets(supabase: Supabase): Promise<TaskResult> {
  let files: string[]
  try {
    files = await readdir(GAMESERVERS_DIR)
  }
  catch {
    console.warn(`Skipping game assets - could not read directory: ${GAMESERVERS_DIR}`)
    return { success: 0, fail: 0 }
  }

  const uploads: GameAssetUpload[] = files
    .map((filename): GameAssetUpload | null => {
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
    .filter((u): u is GameAssetUpload => u !== null)

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
      console.log(`FAIL (${(err as Error).message})`)
      fail++
    }
  }

  return { success, fail }
}

// ── User avatars ──────────────────────────────────────────────────────────────

interface AvatarCandidate {
  filename: string
  username: string
  ext: string
  mimeType: string
}

async function uploadUserAvatars(supabase: Supabase): Promise<TaskResult> {
  let files: string[]
  try {
    files = await readdir(PROFILE_DIR)
  }
  catch {
    console.warn(`Skipping user avatars - could not read directory: ${PROFILE_DIR}`)
    return { success: 0, fail: 0 }
  }

  const candidates: AvatarCandidate[] = files
    .map((filename): AvatarCandidate | null => {
      const ext = extname(filename).toLowerCase()
      const username = filename.slice(0, -ext.length)
      const mimeType = MIME_MAP[ext]

      if (!mimeType) {
        console.warn(`  Skipping "${filename}" - unsupported extension "${ext}"`)
        return null
      }

      return { filename, username, ext, mimeType }
    })
    .filter((c): c is AvatarCandidate => c !== null)

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

  const usernameToId: Record<string, string> = Object.fromEntries(
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
      console.log(`FAIL (${(err as Error).message})`)
      fail++
    }
  }

  return { success, fail }
}

// ── Metrics latest.json ──────────────────────────────────────────────────────

/**
 * Normalizes a metrics row payload from the local DB into the current
 * `MetricsSnapshot` shape defined in `types/metrics.ts`. Older seeded rows
 * may use legacy field names (e.g. `members` instead of `users`) or be
 * missing newer fields - we map and pad them here so the seeded
 * `metrics/latest.json` is always shape-correct for consumers like the
 * status banner renderer.
 *
 * The return type is `MetricsSnapshot`, so any drift in that interface will
 * surface here at typecheck time.
 */
function asObj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function asNum(v: unknown): number {
  return typeof v === 'number' ? v : 0
}
function asRecord<T>(v: unknown): Record<string, T> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {}
}

function normalizeMetricsPayload(raw: unknown): MetricsSnapshot {
  const src = asObj(raw)
  // Legacy snapshots used `members`. Current schema uses `users`.
  const usersSrc = asObj(src.users ?? src.members)
  const teamspeakSrc = asObj(src.teamspeak)
  const gameserversSrc = asObj(src.gameservers)
  const discussionsSrc = asObj(src.discussions)
  const communitySrc = asObj(src.community)
  const storageSrc = asObj(src.storage)

  return {
    collectedAt: typeof src.collectedAt === 'string' && src.collectedAt ? src.collectedAt : new Date().toISOString(),
    users: {
      total: asNum(usersSrc.total),
      online: asNum(usersSrc.online),
      byCountry: asRecord<number>(usersSrc.byCountry),
      byGame: asRecord<number>(usersSrc.byGame),
      bySteamGame: asRecord<number>(usersSrc.bySteamGame),
    },
    community: {
      projects: asNum(communitySrc.projects),
    },
    discussions: {
      total: asNum(discussionsSrc.total),
      replies: asNum(discussionsSrc.replies),
      newTotal: asNum(discussionsSrc.newTotal),
      newReplies: asNum(discussionsSrc.newReplies),
    },
    teamspeak: {
      online: asNum(teamspeakSrc.online),
      byServer: asRecord<number>(teamspeakSrc.byServer),
    },
    gameservers: {
      total: asNum(gameserversSrc.total),
      players: asNum(gameserversSrc.players),
      byServer: asRecord<MetricsServerDetail>(gameserversSrc.byServer),
    },
    storage: {
      buckets: asRecord<MetricsStorageBucket>(storageSrc.buckets),
    },
  }
}

async function uploadMetricsLatest(supabase: Supabase): Promise<TaskResult> {
  const { data, error: fetchError } = await supabase
    .from('metrics')
    .select('data')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()

  if (fetchError !== null || data === null) {
    console.log(`Skipping metrics/latest.json - could not fetch latest metrics row: ${fetchError?.message ?? 'no data'}`)
    return { success: 0, fail: 1 }
  }

  const snapshot = normalizeMetricsPayload(data.data)

  process.stdout.write(`Uploading metrics/latest.json to "${STATIC_BUCKET}" ... `)

  try {
    const { error } = await supabase.storage
      .from(STATIC_BUCKET)
      .upload('metrics/latest.json', Buffer.from(JSON.stringify(snapshot, null, 2)), {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '1800',
      })

    if (error) {
      console.log(`FAIL (${error.message})`)
      return { success: 0, fail: 1 }
    }

    console.log('OK')
    return { success: 1, fail: 0 }
  }
  catch (err) {
    console.log(`FAIL (${(err as Error).message})`)
    return { success: 0, fail: 1 }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
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

  console.log()

  const metricsResult = await uploadMetricsLatest(supabase)
  totalSuccess += metricsResult.success
  totalFail += metricsResult.fail

  console.log(`\nDone. ${totalSuccess} uploaded, ${totalFail} failed.\n`)

  if (totalFail > 0)
    process.exit(1)
}

void main()
