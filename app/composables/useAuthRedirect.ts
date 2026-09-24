// Auth pages are never used as the redirect target, to avoid sign-in loops.
export function useAuthRedirect() {
  const route = useRoute()

  function signInPath(redirectTo?: string): string {
    const target = redirectTo ?? route.fullPath

    if (target.startsWith('/auth/'))
      return '/auth/sign-in'

    return `/auth/sign-in?redirect=${encodeURIComponent(target)}`
  }

  async function navigateToSignIn(redirectTo?: string) {
    return navigateTo(signInPath(redirectTo))
  }

  return { signInPath, navigateToSignIn }
}
