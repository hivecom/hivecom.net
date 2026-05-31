/**
 * Wires the chat client into the host app:
 *
 * 1. Registers the identity provider seam - resolving the current Supabase
 *    session into `{ username, token }` for SASL auth. This is the only place
 *    that knows the JWT comes from Supabase; when Orbit replaces this chat with
 *    a cross-origin iframe, only this function changes (token via postMessage).
 * 2. Auto-connects on site open when the user has enabled the setting.
 *
 * Lives at plugin scope (not in a chat component) so the seam is registered
 * before any surface mounts and a manual connect can authenticate immediately.
 */
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'

export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient()
  const userId = useUserId()
  const { user } = useDataUser(userId)
  const { settings } = useDataUserSettings()
  const { registerIdentityProvider, connect, connState, setMentionKeywords } = useIrcChat()

  const currentUsername = computed<string>(() => {
    const profile = user.value as unknown as { username?: string | null } | null
    return profile?.username ?? ''
  })

  const autoConnectEnabled = computed<boolean>(() => settings.value.chat_autoconnect === true)

  // Keep the chat client's mention keywords in sync with user settings so
  // self-highlighting reflects the configured list without coupling the chat
  // store to the settings composable.
  watch(
    () => settings.value.chat_mention_keywords,
    keywords => setMentionKeywords(Array.isArray(keywords) ? keywords : []),
    { immediate: true, deep: true },
  )

  registerIdentityProvider(async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? ''
    const username = currentUsername.value
    if (token === '' || username === '')
      return null
    return { username, token }
  })

  // One-shot auto-connect once the user, their settings, and an enabled flag are
  // all present. Guarded so it never fires twice or connects unauthenticated.
  let autoConnected = false
  watch(
    () => ({ auto: autoConnectEnabled.value, username: currentUsername.value, uid: userId.value }),
    ({ auto, username, uid }) => {
      if (autoConnected || !auto || uid == null || username === '')
        return
      if (connState.value === 'disconnected') {
        autoConnected = true
        void connect()
      }
    },
    { immediate: true, deep: true },
  )
})
