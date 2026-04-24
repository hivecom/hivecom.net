import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { pushToast } from '@dolanske/vui'
import { isNil } from '@/lib/utils/common'

// Module-level flag so the auto-save watcher is only ever registered once,
// regardless of how many components call useDataUserSettings().
let _autoSaveWatcherRegistered = false

// Single source of truth for user settings
export function getDefaultUserSettings(): Tables<'settings'>['data'] {
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
  }
}

export function useDataUserSettings() {
  const settings = useState<Tables<'settings'>['data']>('user-settings', getDefaultUserSettings)
  const hasFetched = useState<boolean>('user-settings-fetched', () => false)
  const isFetching = useState<boolean>('user-settings-fetching', () => false)
  const settingsLoading = ref(false)
  const settingsError = ref<Error | null>(null)
  const supabase = useSupabaseClient<Database>()
  const user = useUserId()

  const fetchSettings = async (): Promise<Error | null> => {
    if (hasFetched.value)
      return null

    settingsLoading.value = true
    isFetching.value = true

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .maybeSingle()

    settingsLoading.value = false

    if (error) {
      isFetching.value = false
      settingsError.value = error
      return error
    }

    if (data) {
      const fetched = data.data as Tables<'settings'>['data']
      const nonNillSettingValues = Object.fromEntries(Object.entries(fetched).filter(([, v]) => !isNil(v)))
      Object.assign(settings.value, nonNillSettingValues)
    }

    hasFetched.value = true
    isFetching.value = false
    return null
  }

  const updateSettings = async (newSettings: Tables<'settings'>['data']) => {
    if (isNil(user.value)) {
      return
    }

    try {
      await supabase
        .from('settings')
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
      if (isNil(user.value) || isFetching.value) {
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
