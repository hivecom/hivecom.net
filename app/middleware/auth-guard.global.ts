import type { User } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useSupabaseClient } from '#imports'
import { defineNuxtRouteMiddleware, navigateTo } from 'nuxt/app'

const getSupabaseUser = useSupabaseUser as () => Ref<User | null>

const authRequiredRoutes = [
  'votes',
  'votes-id',
  'profile',
  'profile-id',
  'profile-settings',
]

export default defineNuxtRouteMiddleware(async (to: RouteLocationNormalizedLoaded) => {
  if (import.meta.server)
    return

  const supabase = useSupabaseClient()
  const user = getSupabaseUser()

  // If user is not signed they will not be able to navigate to the list of routes
  if (authRequiredRoutes.includes(to.name as string)) {
    if (!user.value) {
      const { data } = await supabase.auth.getSession()
      const sessionUser = data?.session?.user ?? null

      if (!sessionUser) {
        return navigateTo({
          path: '/auth/sign-in',
          query: { redirect: to.fullPath },
          replace: true,
        })
      }
    }
  }
})
