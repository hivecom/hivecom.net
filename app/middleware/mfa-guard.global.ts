import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { useSupabaseClient, useSupabaseUser } from '#imports'
import { defineNuxtRouteMiddleware, navigateTo } from 'nuxt/app'
import { useMfaStatusCache } from '@/composables/useMfaStatusCache'

const getSupabaseClient = useSupabaseClient as () => SupabaseClient
const getSupabaseUser = useSupabaseUser as () => Ref<User | null>

export default defineNuxtRouteMiddleware(async (to: RouteLocationNormalizedLoaded) => {
  if (import.meta.server)
    return

  const supabase = getSupabaseClient()
  const user = getSupabaseUser()
  const mfaCache = useMfaStatusCache()

  if (!user.value) {
    mfaCache.value = { currentLevel: null, nextLevel: null, fetchedAt: 0 }
    return
  }

  const authRoutes = ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password']
  const needsFreshCheck = Date.now() - mfaCache.value.fetchedAt > 30_000

  if (needsFreshCheck) {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      console.warn('Unable to determine MFA assurance level:', error)
      return
    }

    mfaCache.value = {
      currentLevel: data?.currentLevel ?? null,
      nextLevel: data?.nextLevel ?? null,
      fetchedAt: Date.now(),
    }
  }

  const needsAal2 = mfaCache.value.nextLevel === 'aal2' && mfaCache.value.currentLevel !== 'aal2'

  if (needsAal2 && !authRoutes.includes(to.path)) {
    return navigateTo({
      path: '/auth/sign-in',
      query: { ...to.query, mfa: '1' },
      replace: true,
    })
  }
})
