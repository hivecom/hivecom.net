// Plugin scope so the identity provider is registered before any chat surface
// mounts. It's the only place that knows the SASL token is a Supabase JWT.
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

  // Mobile plays at full volume since the OS volume governs playback there
  const isMobile = useMobileViewport()

  const currentUsername = computed<string>(() => {
    const profile = user.value as unknown as { username?: string | null } | null
    return profile?.username ?? ''
  })

  const autoConnectEnabled = computed<boolean>(() => settings.value.chat_autoconnect === true)

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

  // App-wide so the push subscription re-registers even with no chat UI mounted
  useErgoPush()

  registerIdentityProvider(async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? ''
    const username = currentUsername.value
    if (token === '' || username === '')
      return null

    return { username, token }
  })

  // One-shot, and never without a user
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
