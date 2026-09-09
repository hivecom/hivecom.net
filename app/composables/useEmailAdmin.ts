import type { Database } from '@/types/database.types'
import { useSupabaseClient } from '#imports'

// SES send quota for the rolling 24 hour window. Every field degrades to null
// when SES omits it, so the cards have to cope with "unknown" rather than 0.
export interface EmailQuota {
  max24HourSend: number | null
  sentLast24Hours: number | null
  maxSendRate: number | null
}

// Account-level sending health. enforcementStatus is "HEALTHY" on a good day;
// anything else (or no production access) means sends are degraded or capped.
export interface EmailAccount {
  sendingEnabled: boolean
  enforcementStatus: string | null
  productionAccess: boolean
  quota: EmailQuota
  suppressionReasons: string[]
}

// The sending domain's verification state. dkimStatus is "SUCCESS" once the
// DKIM tokens are published in DNS.
export interface EmailIdentity {
  domain: string
  verifiedForSending: boolean
  dkimStatus: string | null
  dkimTokens: string[]
}

// How many members a full broadcast reaches right now: all profiles minus the
// bounce-flagged ones the send skips. Null when the count itself failed.
export interface BroadcastRecipients {
  eligible: number
  suppressed: number
}

// A missing identity is a real state the page shows, so it degrades to null
// instead of failing the whole call.
export interface EmailOverview {
  account: EmailAccount
  identity: EmailIdentity | null
  recipients: BroadcastRecipients | null
}

// The profile behind a suppressed address, when one matches. bouncedFlag is our
// own mirror of the SES suppression; the two can drift apart.
export interface SuppressionUser {
  id: string
  username: string | null
  bouncedFlag: boolean
  disabledFlag: boolean
}

export interface SuppressionEntry {
  email: string
  /** "BOUNCE" or "COMPLAINT", null when SES doesn't report one. */
  reason: string | null
  lastUpdate: string | null
  /** False for rows that only exist because the profile is flagged, like after a delivery delay. */
  sesSuppressed: boolean
  user: SuppressionUser | null
}

// SES pages this list with an opaque forward-only token, so there's no page
// count and no going back: callers accumulate rows instead.
export interface SuppressionPage {
  entries: SuppressionEntry[]
  nextToken: string | null
}

export interface SuppressionRemoval {
  email: string
  removedFromSes: boolean
  profileCleared: boolean
}

export interface BroadcastFailure {
  email: string
  error: string
}

export type BroadcastMode = 'test' | 'send'

// success is false when any individual send failed, which is a partial result
// worth showing rather than an error to swallow.
export interface BroadcastResult {
  success: boolean
  mode: BroadcastMode
  total: number
  sent: number
  skipped: number
  failed: number
  failures: BroadcastFailure[]
}

// Every function wraps its payload in a success flag plus an error string.
type EdgeEnvelope<T> = T & { success: boolean, error?: string }

/**
 * Client for the four admin email edge functions (SES account health, the
 * suppression list, un-suppressing an address, and broadcasts). Auth rides
 * along with the invoke, so the caller must be signed in and hold the matching
 * broadcasts permission. Errors throw as `Error` carrying the function's own
 * message; callers own their loading state and toasts.
 */
export function useEmailAdmin() {
  const supabase = useSupabaseClient<Database>()

  // invoke wraps any non-2xx in an error whose context is the raw Response, so
  // the function's own { error } body is one json() away. Without this every
  // failure reads "Edge Function returned a non-2xx status code".
  async function messageFor(error: unknown, fallback: string): Promise<string> {
    if (error !== null && typeof error === 'object' && 'context' in error) {
      const context = error.context
      if (context instanceof Response) {
        try {
          const body = await context.clone().json() as { error?: string, message?: string }
          const message = body.error ?? body.message
          if (message)
            return message
        }
        catch {
          // Not a json body, fall through to the generic message.
        }
      }
    }
    return error instanceof Error && error.message ? error.message : fallback
  }

  async function invokeEdge<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
    const response = await supabase.functions.invoke<T>(name, { method: 'POST', body })

    // invoke types its error as any, so it gets pinned to unknown before use.
    const invokeError: unknown = response.error
    if (invokeError)
      throw new Error(await messageFor(invokeError, fallback))

    const data = response.data
    if (!data)
      throw new Error(fallback)

    return data
  }

  function guardSuccess(data: { success: boolean, error?: string }, fallback: string): void {
    if (!data.success)
      throw new Error(data.error ?? fallback)
  }

  // Account sending health plus the sending domain's identity state.
  async function fetchOverview(): Promise<EmailOverview> {
    const fallback = 'Could not load email status'
    const data = await invokeEdge<EdgeEnvelope<EmailOverview>>('admin-email-overview', {}, fallback)
    guardSuccess(data, fallback)

    return { account: data.account, identity: data.identity, recipients: data.recipients ?? null }
  }

  // One page of suppressed addresses. Pass the previous page's nextToken to
  // continue; there's no way to page backwards.
  async function fetchSuppressionPage(pageSize?: number, nextToken?: string): Promise<SuppressionPage> {
    const fallback = 'Could not load the suppression list'
    const data = await invokeEdge<EdgeEnvelope<SuppressionPage>>(
      'admin-email-suppression-list',
      { pageSize, nextToken },
      fallback,
    )
    guardSuccess(data, fallback)

    return { entries: data.entries ?? [], nextToken: data.nextToken ?? null }
  }

  // Un-suppresses the address in SES and clears the matching profile flags.
  async function removeSuppression(email: string): Promise<SuppressionRemoval> {
    const fallback = 'Could not remove the suppression'
    const data = await invokeEdge<EdgeEnvelope<SuppressionRemoval>>(
      'admin-email-suppression-remove',
      { email },
      fallback,
    )
    guardSuccess(data, fallback)

    return {
      email: data.email,
      removedFromSes: data.removedFromSes,
      profileCleared: data.profileCleared,
    }
  }

  // mode 'test' only mails the caller; mode 'send' mails every member with an
  // address, minus the bounced ones. A result with success false still carries
  // the counts and the per-address failures, so it's returned, not thrown.
  async function sendBroadcast(
    subject: string,
    text: string,
    html: string | undefined,
    mode: BroadcastMode,
    centered = true,
  ): Promise<BroadcastResult> {
    return invokeEdge<BroadcastResult>(
      'admin-email-broadcast',
      { subject, text, html, mode, centered },
      'Could not send the broadcast',
    )
  }

  return { fetchOverview, fetchSuppressionPage, removeSuppression, sendBroadcast }
}
