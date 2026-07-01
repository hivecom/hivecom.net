/**
 * passkey.ts
 *
 * Thin wrappers over the official supabase-js passkey (WebAuthn) API.
 *
 * Requires `@supabase/supabase-js` >= 2.105.0 and the experimental flag opted in
 * on the client (see `clientOptions.auth.experimental.passkey` in nuxt.config).
 * The passkey feature must also be enabled on the project (config.toml /
 * Dashboard) with the WebAuthn relying party configured.
 *
 * This file is the isolation boundary: components call these helpers instead of
 * touching `supabase.auth.passkey.*` directly, so the experimental surface can
 * be adapted in one place if the API shifts.
 *
 * The full WebAuthn ceremony (navigator.credentials.create/get) is handled
 * inside supabase-js by `registerPasskey()` / `signInWithPasskey()`, so no
 * additional browser library is required for these flows.
 */

import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type Supabase = SupabaseClient<Database>

// ---- Types -------------------------------------------------------------
/** A passkey enrolled by the user, as returned by the GoTrue passkey API. */
export interface EnrolledPasskey {
  id: string
  /** Friendly name derived from the authenticator's AAGUID, renameable by the user. */
  friendly_name?: string
  created_at: string
  /** Updated each time the passkey is used to sign in. */
  last_used_at?: string
}

/** Result of a successful passkey sign-in. */
export interface PasskeySignInResult {
  session: Session | null
  user: User | null
}

// ---- Capability detection ---------------------------------------------
/**
 * Returns true when the current environment can run the WebAuthn ceremony.
 * Use this to gate passkey UI - the API throws in unsupported browsers/SSR.
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof navigator.credentials?.create === 'function'
    && typeof navigator.credentials?.get === 'function'
  )
}

// ---- Registration ------------------------------------------------------
/**
 * Register a passkey for the currently signed-in user.
 *
 * Runs the full WebAuthn registration ceremony and persists the credential.
 * The friendly name is auto-derived from the authenticator; rename it afterwards
 * with {@link renamePasskey}. Requires a confirmed, non-anonymous session.
 */
export async function registerPasskey(supabase: Supabase): Promise<EnrolledPasskey> {
  const { data, error } = await supabase.auth.registerPasskey()
  if (error)
    throw error
  if (!data)
    throw new Error('Passkey registration returned no data.')
  return data
}

// ---- Authentication ----------------------------------------------------
/**
 * Sign in with a passkey using discoverable credentials.
 *
 * The user selects an account from the authenticator UI - no email or phone is
 * required upfront. On success supabase-js stores the session and dispatches a
 * SIGNED_IN event, so callers typically just need to navigate.
 */
export async function signInWithPasskey(supabase: Supabase): Promise<PasskeySignInResult> {
  const { data, error } = await supabase.auth.signInWithPasskey()
  if (error)
    throw error
  return { session: data?.session ?? null, user: data?.user ?? null }
}

// ---- Management --------------------------------------------------------
/** List all passkeys enrolled by the current user. */
export async function listPasskeys(supabase: Supabase): Promise<EnrolledPasskey[]> {
  const { data, error } = await supabase.auth.passkey.list()
  if (error)
    throw error
  return data ?? []
}

/** Rename an enrolled passkey. `friendlyName` is limited to 120 characters. */
export async function renamePasskey(
  supabase: Supabase,
  passkeyId: string,
  friendlyName: string,
): Promise<EnrolledPasskey> {
  const { data, error } = await supabase.auth.passkey.update({ passkeyId, friendlyName })
  if (error)
    throw error
  if (!data)
    throw new Error('Passkey update returned no data.')
  return data
}

/** Delete an enrolled passkey by its ID. */
export async function deletePasskey(supabase: Supabase, passkeyId: string): Promise<void> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId })
  if (error)
    throw error
}
