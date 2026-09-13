import { defineNuxtRouteMiddleware, navigateTo } from 'nuxt/app'
import { useSupabaseClient } from '#imports'
import { usePwa } from '@/composables/usePwa'
import { PWA_START_PAGE_DESTINATIONS, usePwaStartPage } from '@/composables/usePwaStartPage'

// Cold launch only. Global middleware fires on every navigation, so this flag
// pins the behaviour to the very first one - clicking the logo mid-session has
// to actually go home.
let launchHandled = false

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server)
    return

  if (launchHandled)
    return
  launchHandled = true

  // A launch always arrives at a bare `/`. Anything else is a deep link, a
  // shared URL or an auth callback, and a query or hash on `/` is usually a
  // magic-link token, so leave all of it alone.
  if (to.path !== '/' || to.hash || Object.keys(to.query).length > 0)
    return

  // Installed app only. Redirecting a normal browser tab away from the landing
  // page would be a surprise, and the preference is stored per device anyway.
  const { isStandalone } = usePwa()
  if (!isStandalone.value)
    return

  const { startPage } = usePwaStartPage()
  const destination = PWA_START_PAGE_DESTINATIONS.find(d => d.path === startPage.value)
  if (!destination || destination.path === '/')
    return

  // Launching a signed-out device straight into the sign-in wall is worse than
  // showing home, so check the session before handing off to the auth guard.
  if (destination.authRequired) {
    const { data } = await useSupabaseClient().auth.getSession()
    if (!data.session)
      return
  }

  return navigateTo(destination.path, { replace: true })
})
