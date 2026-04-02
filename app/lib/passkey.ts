/**
 * passkey.ts
 *
 * Thin wrapper over the GoTrue passkey REST API (Auth v2.188.0+).
 *
 * All functions currently throw PASSKEY_NOT_AVAILABLE - the hosted Supabase
 * project hasn't confirmed these endpoints are live yet. Once confirmed,
 * replace the stub bodies with real fetch calls (commented inline).
 *
 * Endpoints (relative to Supabase project auth URL):
 *   POST /auth/v1/passkeys/registration/begin
 *   POST /auth/v1/passkeys/registration/complete
 *   POST /auth/v1/passkeys/authentication/begin
 *   POST /auth/v1/passkeys/authentication/complete
 *   GET  /auth/v1/passkeys
 *   DELETE /auth/v1/passkeys/:id
 *
 * When wiring up the WebAuthn ceremony, add @simplewebauthn/browser:
 *   startRegistration(options)   -> credential for completePasskeyRegistration()
 *   startAuthentication(options) -> credential for completePasskeyAuthentication()
 *
 * Migration path from stubs to official supabase-js methods (when they ship):
 * This entire file is the isolation boundary. Components don't import from
 * supabase-js directly for passkeys - swap implementations here only.
 */

// ---- Types ----------------------------------------------------------------

/** A passkey enrolled by the user, as returned by the GoTrue API. */
export interface EnrolledPasskey {
  id: string
  name: string | null
  created_at: string
  last_used_at: string | null
  /** Authenticator Attestation GUID - identifies the authenticator model/platform. */
  aaguid: string | null
}

/**
 * Options returned by /passkeys/registration/begin.
 * Forward to @simplewebauthn/browser startRegistration() without modification.
 *
 * Typed loosely for now - tighten to PublicKeyCredentialCreationOptionsJSON
 * from @simplewebauthn/types once the package is added.
 */
export type PasskeyRegistrationOptions = Record<string, unknown>

/**
 * Options returned by /passkeys/authentication/begin.
 * Forward to @simplewebauthn/browser startAuthentication() without modification.
 *
 * Typed loosely for now - tighten to PublicKeyCredentialRequestOptionsJSON
 * from @simplewebauthn/types once the package is added.
 */
export type PasskeyAuthenticationOptions = Record<string, unknown>

/** Returned by completePasskeyAuthentication() on success. */
export interface PasskeySession {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

// ---- Sentinel error -------------------------------------------------------

/**
 * Thrown by all functions in this module until the backend is confirmed live.
 *
 * To confirm: curl POST /auth/v1/passkeys/registration/begin with a valid
 * Authorization header and check for a non-404 response. Any other status
 * (including 400/422) means the endpoint exists.
 *
 * Replace stub implementations and remove this error once confirmed.
 */
export const PASSKEY_NOT_AVAILABLE: Error = new Error(
  'Passkey API not yet available - Supabase Auth v2.188.0+ required on hosted project.',
)

// ---- Helpers --------------------------------------------------------------

function _authHeaders(accessToken: string): HeadersInit {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

// ---- Registration ---------------------------------------------------------

/**
 * Step 1 of passkey enrollment.
 *
 * Returns WebAuthn creation options from the server.
 * Pass the result directly to @simplewebauthn/browser startRegistration().
 */
export async function beginPasskeyRegistration(
  supabaseUrl: string,
  accessToken: string,
): Promise<PasskeyRegistrationOptions> {
  // TODO: uncomment once backend confirmed live
  // const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/registration/begin`, {
  //   method: 'POST',
  //   headers: _authHeaders(accessToken),
  // })
  // if (!res.ok) throw new Error(`Passkey registration begin failed: ${res.status}`)
  // return res.json() as Promise<PasskeyRegistrationOptions>

  void supabaseUrl
  void accessToken
  throw PASSKEY_NOT_AVAILABLE
}

/**
 * Step 2 of passkey enrollment.
 *
 * Sends the RegistrationResponseJSON from startRegistration() back to the
 * server to verify and persist. Pass an optional friendly name so the user
 * can identify the passkey in their list later.
 */
export async function completePasskeyRegistration(
  supabaseUrl: string,
  accessToken: string,
  credential: unknown,
  name?: string,
): Promise<EnrolledPasskey> {
  // TODO: uncomment once backend confirmed live
  // const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/registration/complete`, {
  //   method: 'POST',
  //   headers: _authHeaders(accessToken),
  //   body: JSON.stringify({ credential, name }),
  // })
  // if (!res.ok) throw new Error(`Passkey registration complete failed: ${res.status}`)
  // return res.json() as Promise<EnrolledPasskey>

  void supabaseUrl
  void accessToken
  void credential
  void name
  throw PASSKEY_NOT_AVAILABLE
}

// ---- Authentication -------------------------------------------------------

/**
 * Step 1 of passkey sign-in.
 *
 * Returns WebAuthn request options from the server.
 * Pass the result directly to @simplewebauthn/browser startAuthentication().
 *
 * No access token needed - this is a pre-auth call. Discoverable credentials
 * mean the user doesn't need to identify themselves first.
 */
export async function beginPasskeyAuthentication(
  supabaseUrl: string,
): Promise<PasskeyAuthenticationOptions> {
  // TODO: uncomment once backend confirmed live
  // const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/authentication/begin`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  // })
  // if (!res.ok) throw new Error(`Passkey authentication begin failed: ${res.status}`)
  // return res.json() as Promise<PasskeyAuthenticationOptions>

  void supabaseUrl
  throw PASSKEY_NOT_AVAILABLE
}

/**
 * Step 2 of passkey sign-in.
 *
 * Sends the AuthenticationResponseJSON from startAuthentication() to the
 * server. Returns a Supabase session on success - pass to supabase.auth.setSession().
 */
export async function completePasskeyAuthentication(
  supabaseUrl: string,
  credential: unknown,
): Promise<PasskeySession> {
  // TODO: uncomment once backend confirmed live
  // const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/authentication/complete`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ credential }),
  // })
  // if (!res.ok) throw new Error(`Passkey authentication complete failed: ${res.status}`)
  // return res.json() as Promise<PasskeySession>

  void supabaseUrl
  void credential
  throw PASSKEY_NOT_AVAILABLE
}

// ---- Management -----------------------------------------------------------

/**
 * List all passkeys enrolled by the current user.
 */
export async function listPasskeys(
  supabaseUrl: string,
  accessToken: string,
): Promise<EnrolledPasskey[]> {
  // TODO: uncomment once backend confirmed live
  // const res = await fetch(`${supabaseUrl}/auth/v1/passkeys`, {
  //   method: 'GET',
  //   headers: _authHeaders(accessToken),
  // })
  // if (!res.ok) throw new Error(`Failed to list passkeys: ${res.status}`)
  // return res.json() as Promise<EnrolledPasskey[]>

  void supabaseUrl
  void accessToken
  throw PASSKEY_NOT_AVAILABLE
}

/**
 * Delete an enrolled passkey by its ID.
 */
export async function deletePasskey(
  supabaseUrl: string,
  accessToken: string,
  id: string,
): Promise<void> {
  // TODO: uncomment once backend confirmed live
  // const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/${id}`, {
  //   method: 'DELETE',
  //   headers: _authHeaders(accessToken),
  // })
  // if (!res.ok) throw new Error(`Failed to delete passkey: ${res.status}`)

  void supabaseUrl
  void accessToken
  void id
  throw PASSKEY_NOT_AVAILABLE
}
