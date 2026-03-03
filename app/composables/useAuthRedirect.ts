/**
 * Composable that provides a helper for navigating to the sign-in page while
 * preserving the current route so the user is returned to it after signing in.
 *
 * Auth pages themselves (/auth/*) are excluded from the redirect param to
 * avoid circular loops.
 */
export function useAuthRedirect() {
  const route = useRoute()

  /**
   * Returns the sign-in path, including a `redirect` query param pointing at
   * the current route – unless the current route is itself an auth page, in
   * which case the plain sign-in path is returned.
   */
  function signInPath(redirectTo?: string): string {
    const target = redirectTo ?? route.fullPath

    if (target.startsWith('/auth/'))
      return '/auth/sign-in'

    return `/auth/sign-in?redirect=${encodeURIComponent(target)}`
  }

  /**
   * Navigates to the sign-in page, carrying the current (or provided) path as
   * the post-authentication redirect destination.
   */
  async function navigateToSignIn(redirectTo?: string) {
    return navigateTo(signInPath(redirectTo))
  }

  return { signInPath, navigateToSignIn }
}
