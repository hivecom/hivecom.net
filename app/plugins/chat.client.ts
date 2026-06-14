/**
 * Wires the chat client into the host app:
 *
 * 1. Registers the identity provider seam - resolving the current Supabase
 *    session into `{ username, token }` for SASL auth. This is the only place
 *    that knows the JWT comes from Supabase; when Orbit replaces this chat with
 *    a cross-origin iframe, only this function changes (token via postMessage).
 * 2. Auto-connects on site open when the user has enabled the setting.
 * 3. Boots the Ergo Web Push orchestrator so the chat-push subscription is
 *    re-registered on reconnect and on browser subscription rotation, even when
 *    no chat surface (and thus no SettingsModal) is mounted.
 *
 * Lives at plugin scope (not in a chat component) so the seam is registered
 * before any surface mounts and a manual connect can authenticate immediately.
 */
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useErgoPush } from '@/composables/useErgoPush'
import { setBrowserNotificationsEnabled, setNotificationSounds, useIrcChat } from '@/composables/useIrcChat'
import { useMobileViewport } from '@/lib/mediaQuery'

export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient()
  const userId = useUserId()
  const { user } = useDataUser(userId)
  const { settings } = useDataUserSettings()
  const { registerIdentityProvider, connect, connState, setMentionKeywords } = useIrcChat()

  // On mobile the device/OS volume governs playback, so a separate in-app slider
  // is confusing. Always play notification sounds at full volume there.
  const isMobile = useMobileViewport()

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

  watch(
    () => settings.value.chat_browser_notifications,
    enabled => setBrowserNotificationsEnabled(enabled === true),
    { immediate: true },
  )

  watch(
    () => [
      settings.value.chat_sound_mention_choice,
      settings.value.chat_sound_message_choice,
      settings.value.chat_sound_mention_url,
      settings.value.chat_sound_message_url,
      settings.value.chat_sound_mention_design,
      settings.value.chat_sound_message_design,
      settings.value.chat_sound_volume,
      isMobile.value,
    ] as const,
    ([mentionChoice, messageChoice, mentionUrl, messageUrl, mentionDesign, messageDesign, volume, mobile]) => setNotificationSounds({
      mentionChoice: mentionChoice ?? 'none',
      messageChoice: messageChoice ?? 'none',
      mentionUrl: mentionUrl ?? '',
      messageUrl: messageUrl ?? '',
      mentionDesign: mentionDesign ?? null,
      messageDesign: messageDesign ?? null,
      volume: mobile ? 1 : (typeof volume === 'number' ? volume / 100 : 1),
    }),
    { immediate: true },
  )

  // Initialise the Ergo Web Push orchestrator (idempotent): registers the
  // reconnect/rotation watchers once, app-wide, independent of chat UI mounting.
  useErgoPush()

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
        void connect(true)
      }
    },
    { immediate: true, deep: true },
  )
})
