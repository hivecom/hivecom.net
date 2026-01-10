import type { User } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
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

  // const supabase = getSupabaseClient()
  const user = getSupabaseUser()

  // If user is not signed they will not be able to navigate to the list of routes
  if (!user.value && authRequiredRoutes.includes(to.name as string)) {
    return navigateTo({
      path: '/auth/sign-in',
      query: { redirect: to.fullPath },
      replace: true,
    })
  }
})
