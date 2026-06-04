import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { pushToast } from '@dolanske/vui'
import { useMfaStatus } from '@/composables/useMfaStatus'
import { isNil } from '@/lib/utils/common'

// Module-level flag so the auto-save watcher is only ever registered once,
// regardless of how many components call useDataUserSettings().
let _autoSaveWatcherRegistered = false

const GUEST_SETTINGS_KEY = 'hivecom.guest.settings'

// Single source of truth for user settings
export function getDefaultUserSettings(): Tables<'user_settings'>['data'] {
  return {
    theme: 'dark',
    show_nsfw_content: true,
    show_nsfw_warning: true,
    show_offtopic_replies: false,
    show_thread_replies: false,
    discussion_view_mode: 'flat',
    show_forum_updates: true,
    show_forum_recently_visited: true,
    show_forum_archived: false,
    show_forum_unread_bubbles: true,
    editor_floating: false,
    strip_image_metadata: true,
    show_user_banners: true,
    allow_custom_css: false,
    allow_browser_zoom: false,
    confirm_external_links: true,
    admin_mini_sidebar: false,
    admin_expanded_layout: false,
    admin_asset_view_mode: 'table',
    admin_asset_flat_view: false,
    chat_colored_nicks: true,
    chat_notify_only_mentions: true,
    chat_autoconnect: false,
    chat_show_inline_embeds: true,
    chat_show_previews: true,
    chat_font_size: 13,
    chat_mobile_font_size: 14,
    chat_mention_keywords: [],
    chat_browser_notifications: false,
    chat_show_timestamps: true,
    chat_timestamp_format: 'HH:mm:ss',
    chat_display_mode: 'modern',
  }
}

export function useDataUserSettings() {
  const settings = useState<Tables<'user_settings'>['data']>('user-settings', getDefaultUserSettings)
  const hasFetched = useState<boolean>('user-settings-fetched', () => false)
  const isFetching = useState<boolean>('user-settings-fetching', () => false)
  const settingsLoading = ref(false)
  const settingsError = ref<Error | null>(null)
  const supabase = useSupabaseClient<Database>()
  const user = useUserId()
  const mfaStatus = useMfaStatus()

  // MFA-enrolled users on an aal1 session cannot pass the is_aal2_if_mfa() RLS
  // check, so any write to user_settings would fail. The mfa-guard redirects
  // them to the authenticator challenge; until they finish, skip writes so we
  // don't surface a confusing row-level-security error.
  const mfaStepUpPending = () =>
    mfaStatus.value.nextLevel === 'aal2' && mfaStatus.value.currentLevel !== 'aal2'

  const fetchSettings = async (): Promise<Error | null> => {
    if (hasFetched.value)
      return null

    settingsLoading.value = true
    isFetching.value = true

    // Guest path: restore persisted settings from localStorage.
    if (isNil(user.value)) {
      if (import.meta.client) {
        const stored = localStorage.getItem(GUEST_SETTINGS_KEY)
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Partial<Tables<'user_settings'>['data']>
            const nonNilValues = Object.fromEntries(Object.entries(parsed).filter(([, v]) => !isNil(v)))
            Object.assign(settings.value, nonNilValues)
          }
          catch {}
        }
      }
      hasFetched.value = true
      settingsLoading.value = false
      await nextTick()
      isFetching.value = false
      return null
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .maybeSingle()

    settingsLoading.value = false

    if (error) {
      isFetching.value = false
      settingsError.value = error
      return error
    }

    if (data) {
      const fetched = data.data as Tables<'user_settings'>['data'] | null
      if (fetched) {
        const nonNillSettingValues = Object.fromEntries(Object.entries(fetched).filter(([, v]) => !isNil(v)))
        Object.assign(settings.value, nonNillSettingValues)
      }
    }

    hasFetched.value = true
    // Defer clearing isFetching until the next tick so the deep settings watcher
    // (which is also deferred) still sees isFetching=true and skips the auto-save.
    // Without this, the watcher fires after isFetching is already false and
    // attempts a write that RLS blocks when MFA step-up is pending.
    await nextTick()
    isFetching.value = false
    return null
  }

  const updateSettings = async (newSettings: Tables<'user_settings'>['data']) => {
    if (isNil(user.value)) {
      return
    }

    if (mfaStepUpPending()) {
      return
    }

    try {
      await supabase
        .from('user_settings')
        .upsert({ id: user.value, data: newSettings })
        .throwOnError()
    }
    catch (e) {
      pushToast('Failed to save settings', { description: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  // Auto save when settings update - only register once across all callers,
  // and only on the client (the watcher does a Supabase write which requires auth).
  if (import.meta.client && !_autoSaveWatcherRegistered) {
    _autoSaveWatcherRegistered = true
    watch(settings, async (newSettings) => {
      if (isFetching.value)
        return

      if (isNil(user.value)) {
        localStorage.setItem(GUEST_SETTINGS_KEY, JSON.stringify(newSettings))
        return
      }

      await updateSettings(newSettings)
    }, { deep: true })
  }

  // Re-fetch settings when the user changes (login/logout).
  // The initial fetch on page load is handled by useInitialUserPreferences
  // inside Loading.vue, which blocks the fade-out until both settings and
  // the custom theme are ready.
  watch(user, async (newUser) => {
    if (isNil(newUser)) {
      hasFetched.value = false
      isFetching.value = true
      // Reset to defaults then restore any persisted guest settings.
      const merged = { ...getDefaultUserSettings() }
      const stored = localStorage.getItem(GUEST_SETTINGS_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<Tables<'user_settings'>['data']>
          const nonNilValues = Object.fromEntries(Object.entries(parsed).filter(([, v]) => !isNil(v)))
          Object.assign(merged, nonNilValues)
        }
        catch {}
      }
      Object.assign(settings.value, merged)
      await nextTick()
      isFetching.value = false
      return
    }

    await fetchSettings()
  })

  return {
    settings,
    settingsLoading,
    settingsError,
    fetchSettings,
  }
}
