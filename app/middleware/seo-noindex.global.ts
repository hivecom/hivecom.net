export default defineNuxtRouteMiddleware((to) => {
  const noindexPrefixes = ['/admin', '/auth', '/playground', '/profile', '/votes']
  const shouldNoindex = noindexPrefixes.some(prefix => to.path === prefix || to.path.startsWith(`${prefix}/`))

  if (!shouldNoindex)
    return

  useSeoMeta({
    robots: 'noindex, nofollow',
  })
})
