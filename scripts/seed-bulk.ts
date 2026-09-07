#!/usr/bin/env node

/**
 * Runs supabase/seed.bulk.sql against the local database.
 *
 * seed.sql gives you fixtures - specific rows for specific UI states. This adds
 * volume on top, so you can see what the forum, profile lists and RSVP panels do
 * with a few thousand rows instead of a few dozen. It is additive and idempotent:
 * run it after a reset, run it twice, run it again with bigger numbers to top up.
 *
 *   npm run seed:bulk
 *   npm run seed:bulk -- --users=2000 --discussions=3000 --replies=40000
 *
 * Flags map straight onto psql variables of the same name, so the SQL file stays
 * the single source of truth for the defaults.
 *
 * Talks to the database through `docker exec` rather than a client library,
 * because psql is already in the Supabase db container and there is no reason to
 * add a Postgres driver to the app's dependency tree for a dev-only script.
 *
 * Connects as supabase_admin rather than postgres. The SQL briefly disables the
 * auth.users trigger that auto-creates profiles, and that table is owned by
 * supabase_auth_admin, so plain postgres cannot touch its triggers.
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SQL_FILE = join(ROOT, 'supabase', 'seed.bulk.sql')
const CONFIG_FILE = join(ROOT, 'supabase', 'config.toml')

const KNOWN_FLAGS = ['users', 'discussions', 'replies', 'events'] as const

function readProjectId(): string {
  const match = readFileSync(CONFIG_FILE, 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)

  if (!match)
    throw new Error(`Could not read project_id from ${CONFIG_FILE}`)

  return match[1]
}

function parseFlags(argv: string[]): string[] {
  const vars: string[] = []

  for (const arg of argv) {
    const match = arg.match(/^--([a-z]+)=(\d+)$/)

    if (!match) {
      throw new Error(`Unrecognized argument "${arg}". Expected --<name>=<number>, one of: ${KNOWN_FLAGS.join(', ')}`)
    }

    const [, name, value] = match

    if (!KNOWN_FLAGS.includes(name as typeof KNOWN_FLAGS[number])) {
      throw new Error(`Unknown flag "--${name}". Expected one of: ${KNOWN_FLAGS.join(', ')}`)
    }

    if (Number(value) < 1) {
      throw new Error(`--${name} must be at least 1`)
    }

    vars.push('-v', `${name}=${value}`)
  }

  return vars
}

async function run(command: string, args: string[], stdin?: string, quiet = false): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdin === undefined ? 'inherit' : 'pipe', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'],
    })

    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))

    if (stdin !== undefined) {
      child.stdin!.end(stdin)
    }
  })
}

async function main() {
  const container = `supabase_db_${readProjectId()}`
  const vars = parseFlags(process.argv.slice(2))
  const sql = readFileSync(SQL_FILE, 'utf8')

  const running = await run('docker', ['inspect', '--format', '{{.State.Running}}', container], '', true)
    .catch(() => 1)

  if (running !== 0) {
    console.error(`\nContainer ${container} is not running. Start the stack first with npm run dev.\n`)
    process.exit(1)
  }

  const started = Date.now()
  const code = await run('docker', [
    'exec',
    '-i',
    // Local Supabase always uses this password. It is not a secret.
    '-e',
    'PGPASSWORD=postgres',
    container,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    ...vars,
    '-f',
    '-',
  ], sql)

  if (code !== 0) {
    console.error('\nBulk seed failed. Nothing was committed.\n')
    process.exit(code)
  }

  console.log(`\nBulk seed done in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`)
}

void main()
