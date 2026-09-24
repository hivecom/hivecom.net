/**
 * Wrappers over the experimental supabase-js passkey API. Components go
 * through these instead of `supabase.auth.passkey.*` so an API shift gets
 * adapted in one place.
 *
 * Needs `@supabase/supabase-js` >= 2.105.0, the client flag
 * `clientOptions.auth.experimental.passkey` in nuxt.config, and passkeys
 * enabled on the project with the WebAuthn relying party configured.
 */

import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type Supabase = SupabaseClient<Database>

// ---- Types -------------------------------------------------------------
export interface EnrolledPasskey {
  id: string

  /** Derived from the authenticator's AAGUID until the user renames it. */
  friendly_name?: string
  created_at: string

  last_used_at?: string
}

export interface PasskeySignInResult {
  session: Session | null
  user: User | null
}

// ---- Capability detection ---------------------------------------------
/** Gate passkey UI on this. The API throws in unsupported browsers and SSR. */
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
/** Requires a confirmed, non-anonymous session. */
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
 * Discoverable credentials, so no email or phone up front. supabase-js stores
 * the session and fires SIGNED_IN, so callers usually just navigate.
 */
export async function signInWithPasskey(supabase: Supabase): Promise<PasskeySignInResult> {
  const { data, error } = await supabase.auth.signInWithPasskey()
  if (error)
    throw error

  return { session: data?.session ?? null, user: data?.user ?? null }
}

// ---- Management --------------------------------------------------------
export async function listPasskeys(supabase: Supabase): Promise<EnrolledPasskey[]> {
  const { data, error } = await supabase.auth.passkey.list()
  if (error)
    throw error

  return data ?? []
}

/** `friendlyName` is limited to 120 characters. */
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

export async function deletePasskey(supabase: Supabase, passkeyId: string): Promise<void> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId })
  if (error)
    throw error
}
