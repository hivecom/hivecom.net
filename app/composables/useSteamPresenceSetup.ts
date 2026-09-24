import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { computed, onMounted, ref } from 'vue'
import { useUserId } from '@/composables/useUserId'

export type SteamSetupState = 'link' | 'enable-presence' | null

/**
 * What the user still has to do before their game activity shows up. Every
 * nudge reads it from here, so no two of them ask for different things.
 */
export function useSteamPresenceSetup() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const userId = useUserId()

  const profile = ref<Pick<Tables<'profiles'>, 'steam_id' | 'rich_presence_enabled'> | null>(null)

  const state = computed<SteamSetupState>(() => {
    if (!user.value || !profile.value)
      return null

    if (!profile.value.steam_id)
      return 'link'

    if (!profile.value.rich_presence_enabled)
      return 'enable-presence'

    return null
  })

  const title = computed(() => {
    if (state.value === 'link')
      return 'Show what you\'re playing'

    if (state.value === 'enable-presence')
      return 'Turn on rich presence'

    return ''
  })

  const body = computed(() => {
    if (state.value === 'link')
      return 'Link your Steam account to show your game activity alongside the rest of the community.'

    if (state.value === 'enable-presence')
      return 'Steam is linked but rich presence is off. Enable it to show your current game on Hivecom.'

    return ''
  })

  /** One line, for the places that only have a tile to say it in. */
  const shortBody = computed(() => {
    if (state.value === 'link')
      return 'Link Steam to see what you\'ve been playing here.'

    if (state.value === 'enable-presence')
      return 'Rich presence is off, so nothing you play shows up here.'

    return ''
  })

  const buttonLabel = computed(() => {
    if (state.value === 'link')
      return 'Link Steam'

    if (state.value === 'enable-presence')
      return 'Enable Rich Presence'

    return ''
  })

  onMounted(async () => {
    if (!user.value || !userId.value)
      return

    const { data } = await supabase
      .from('profiles')
      .select('steam_id, rich_presence_enabled')
      .eq('id', userId.value)
      .single()

    if (data)
      profile.value = data
  })

  return { state, title, body, shortBody, buttonLabel }
}
