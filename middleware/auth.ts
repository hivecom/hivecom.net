export default defineNuxtRouteMiddleware(async () => {
  const supabase = useSupabaseClient()
  const { error } = await supabase.auth.refreshSession()
  if (error) {
    return navigateTo('/login')
  }
})
