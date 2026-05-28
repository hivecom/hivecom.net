<script setup lang="ts">
import { Alert, Badge, Button, Card, Drawer, Flex, Input, Spinner, Switch, Tooltip } from '@dolanske/vui'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import MetaballContainer from '@/components/Shared/MetaballContainer.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

import '@/assets/elements/auth.scss'

interface OAuthClientDetails {
  name: string
}

interface AuthorizationDetails {
  client: OAuthClientDetails
  redirect_uri?: string
  scopes?: string[]
}

interface DecisionRedirect {
  redirect_to?: string
  redirect_url?: string
}

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const isDev = process.env.NODE_ENV === 'development'
const showDebugPanel = ref(isDev)
const debugDrawerOpen = ref(false)

const debugOptions = reactive({
  bypassAuth: false,
  forceLoading: false,
  forceError: false,
  forceConfirm: false,
  customError: 'Invalid or expired authorization request.',
  skipRedirect: false,
})

const mockDetails: AuthorizationDetails = {
  client: { name: 'Example App' },
  redirect_uri: 'https://example.com/oauth/callback',
  scopes: ['openid', 'email', 'profile'],
}

const isBelowS = useBreakpoint('<s')
const metaballHeight = computed(() => (isBelowS.value ? '100vh' : 'min(720px, 96vh)'))
const metaballWidth = computed(() => (isBelowS.value ? '100%' : 'min(520px, 96vw)'))

const authorizationId = computed(() => (typeof route.query.authorization_id === 'string' ? route.query.authorization_id : null))
const hasAuthorizationId = computed(() => Boolean(authorizationId.value))

const loading = ref(false)
const redirecting = ref(false)
const submitting = ref<'approve' | 'deny' | null>(null)
const errorMessage = ref('')
const details = ref<AuthorizationDetails | null>(null)

useSeoMeta({
  title: 'Authorize',
  description: 'Authorize an application to access your Hivecom account.',
  ogTitle: 'Authorize',
  ogDescription: 'Authorize an application to access your Hivecom account.',
})

async function ensureAuthenticatedOrRedirect() {
  if (isDev && debugOptions.bypassAuth)
    return true

  const { data, error } = await supabase.auth.getUser()

  // Treat both an explicit error and a missing user as unauthenticated - redirect to login
  if (error || !data.user) {
    redirecting.value = true
    await navigateTo({
      path: '/auth/sign-in',
      query: { redirect: route.fullPath },
    })
    return false
  }

  return true
}

async function loadAuthorizationDetails() {
  errorMessage.value = ''

  if (!authorizationId.value) {
    return
  }

  loading.value = true

  try {
    const isAuthed = await ensureAuthenticatedOrRedirect()
    if (!isAuthed)
      return
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId.value)

    if (error)
      throw error

    if (!data || typeof (data as AuthorizationDetails).client?.name !== 'string') {
      errorMessage.value = 'Invalid or expired authorization request.'
      details.value = null
      return
    }

    details.value = data as AuthorizationDetails
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) : '')
    errorMessage.value = msg || 'Unable to load authorization details.'
    details.value = null
  }
  finally {
    loading.value = false
  }
}

async function decide(decision: 'approve' | 'deny') {
  errorMessage.value = ''

  if (!authorizationId.value) {
    errorMessage.value = 'Missing authorization_id.'
    return
  }

  submitting.value = decision

  try {
    const isAuthed = await ensureAuthenticatedOrRedirect()
    if (!isAuthed)
      return

    const result = decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId.value)
      : await supabase.auth.oauth.denyAuthorization(authorizationId.value)

    if (result.error)
      throw result.error

    const redirectData = result.data as unknown as DecisionRedirect | null
    const redirectTo = redirectData?.redirect_to ?? redirectData?.redirect_url

    if (!redirectTo) {
      errorMessage.value = 'Missing redirect URL from Supabase.'
      return
    }

    if (typeof window !== 'undefined') {
      if (isDev && debugOptions.skipRedirect)
        return
      window.location.assign(redirectTo)
      return
    }

    if (isDev && debugOptions.skipRedirect)
      return

    await navigateTo(redirectTo, { external: true })
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to complete OAuth decision.'
  }
  finally {
    submitting.value = null
  }
}

function applyDebugOptions() {
  if (!isDev)
    return

  if (debugOptions.forceConfirm) {
    details.value = mockDetails
    errorMessage.value = ''
    loading.value = false
    return
  }

  if (debugOptions.forceError) {
    errorMessage.value = debugOptions.customError
    details.value = null
    loading.value = false
    return
  }

  if (debugOptions.forceLoading) {
    loading.value = true
    errorMessage.value = ''
    details.value = null
    return
  }

  // Reset and reload
  loading.value = false
  errorMessage.value = ''
  void loadAuthorizationDetails()
}

onMounted(() => {
  if (!hasAuthorizationId.value) {
    if (!isDev)
      void navigateTo('/profile')
    return
  }
  void loadAuthorizationDetails()
})
</script>

<template>
  <Flex y-center x-center class="sign-in-page" column expand>
    <MetaballContainer :width="metaballWidth" :height="metaballHeight" min-height="520px">
      <Card class="login-card" separators>
        <template #header>
          <h4>Authorize</h4>
        </template>

        <div class="container-xs consent-body">
          <Flex x-center y-center column gap="l" class="py-l">
            <ErrorAlert v-if="errorMessage" standalone message="Authorization failed" :error="errorMessage" />

            <Flex v-else-if="loading || redirecting" x-center y-center expand style="min-height: 256px">
              <Spinner size="l" />
            </Flex>

            <template v-else-if="details">
              <Flex column gap="xs" x-center y-center>
                <div class="app-icon">
                  <span class="text-color-lighter">{{ details.client.name.charAt(0).toUpperCase() }}</span>
                </div>
                <h5>{{ details.client.name }}</h5>
                <p class="text-s text-color-lighter">
                  Requesting access to your Hivecom account.
                </p>
              </Flex>

              <Flex v-if="details.scopes && details.scopes.length" column gap="xs" expand y-center>
                <span class="text-xs text-color-lighter">Requested permissions</span>
                <Flex wrap gap="xs">
                  <Badge v-for="scope in details.scopes" :key="scope" variant="neutral">
                    {{ scope }}
                  </Badge>
                </Flex>
              </Flex>

              <Flex v-if="details.redirect_uri" column gap="xs" expand y-center>
                <span class="text-xs text-color-lighter">Redirect URI</span>
                <code class="redirect-uri text-xs">{{ details.redirect_uri }}</code>
              </Flex>

              <Flex column gap="s" expand>
                <Button
                  expand
                  variant="accent"
                  :loading="submitting === 'approve'"
                  :disabled="Boolean(submitting)"
                  @click="decide('approve')"
                >
                  Approve
                </Button>
                <Button
                  expand
                  variant="gray"
                  :loading="submitting === 'deny'"
                  :disabled="Boolean(submitting)"
                  @click="decide('deny')"
                >
                  Deny
                </Button>
              </Flex>
            </template>

            <template v-else-if="!hasAuthorizationId && isDev">
              <Alert variant="info" filled>
                <p class="text-s">
                  No <strong class="text-s">authorization_id</strong> present. In production this redirects to your profile.
                </p>
              </Alert>
            </template>
          </Flex>
        </div>
      </Card>
    </MetaballContainer>
    <div class="animated-blob first" />
    <div class="animated-blob second" />

    <template v-if="isDev && showDebugPanel">
      <!-- Mobile: floating button + drawer -->
      <template v-if="isBelowS">
        <Button class="debug-fab" square variant="gray" @click="debugDrawerOpen = true">
          <Icon name="ph:bug" size="20" />
        </Button>
        <Drawer :open="debugDrawerOpen" @close="debugDrawerOpen = false">
          <Flex y-center gap="s" class="mb-m">
            <Icon name="ph:bug" size="24" />
            <h4>Debug Panel</h4>
          </Flex>
          <Flex column gap="m">
            <Flex y-center gap="m">
              <Tooltip>
                <Switch v-model="debugOptions.bypassAuth" :disabled="Boolean(user)" />
                <template #tooltip>
                  <p>{{ user ? 'Already logged in - bypass has no effect' : 'Skip auth check when testing with a real authorization_id' }}</p>
                </template>
              </Tooltip>
              <span>Bypass Authentication</span>
            </Flex>
            <Flex y-center gap="m">
              <Switch v-model="debugOptions.forceConfirm" :disabled="debugOptions.forceError || debugOptions.forceLoading" />
              <span>Force Confirm</span>
            </Flex>
            <Flex y-center gap="m">
              <Switch v-model="debugOptions.forceLoading" :disabled="debugOptions.forceError || debugOptions.forceConfirm" />
              <span>Force Loading State</span>
            </Flex>
            <Flex y-center gap="m">
              <Switch v-model="debugOptions.forceError" :disabled="debugOptions.forceLoading || debugOptions.forceConfirm" />
              <span>Force Error State</span>
            </Flex>
            <Flex v-if="debugOptions.forceError" column gap="s">
              <label>Custom Error Message:</label>
              <Input v-model="debugOptions.customError" expand />
            </Flex>
            <Flex y-center gap="m">
              <Switch v-model="debugOptions.skipRedirect" />
              <span>Skip Redirect</span>
            </Flex>
            <Button expand variant="accent" @click="applyDebugOptions(); debugDrawerOpen = false">
              Apply Debug Settings
            </Button>
          </Flex>
        </Drawer>
      </template>

      <!-- Desktop: fixed card -->
      <Card v-else class="debug-panel">
        <template #header>
          <Flex y-center gap="m">
            <Icon name="ph:bug" size="24" />
            <h3>Debug Panel</h3>
          </Flex>
        </template>
        <Flex column gap="m" class="p-m">
          <Flex y-center gap="m">
            <Tooltip>
              <Switch v-model="debugOptions.bypassAuth" :disabled="Boolean(user)" />
              <template #tooltip>
                <p>{{ user ? 'Already logged in - bypass has no effect' : 'Skip auth check when testing with a real authorization_id' }}</p>
              </template>
            </Tooltip>
            <span>Bypass Authentication</span>
          </Flex>
          <Flex y-center gap="m">
            <Switch v-model="debugOptions.forceConfirm" :disabled="debugOptions.forceError || debugOptions.forceLoading" />
            <span>Force Confirm</span>
          </Flex>
          <Flex y-center gap="m">
            <Switch v-model="debugOptions.forceLoading" :disabled="debugOptions.forceError || debugOptions.forceConfirm" />
            <span>Force Loading State</span>
          </Flex>
          <Flex y-center gap="m">
            <Switch v-model="debugOptions.forceError" :disabled="debugOptions.forceLoading || debugOptions.forceConfirm" />
            <span>Force Error State</span>
          </Flex>
          <Flex v-if="debugOptions.forceError" column gap="s">
            <label>Custom Error Message:</label>
            <Input v-model="debugOptions.customError" expand />
          </Flex>
          <Flex y-center gap="m">
            <Switch v-model="debugOptions.skipRedirect" />
            <span>Skip Redirect</span>
          </Flex>
          <Button expand variant="accent" @click="applyDebugOptions">
            Apply Debug Settings
          </Button>
        </Flex>
      </Card>
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.consent-body {
  min-height: 356px;
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--border-radius-l);
  background-color: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  font-size: var(--font-size-xl);
  font-weight: 600;
  user-select: none;
}

.redirect-uri {
  display: block;
  padding: var(--space-xs) var(--space-s);
  background-color: var(--color-bg-lowered);
  border: 1px solid var(--color-border-weak);
  border-radius: var(--border-radius-s);
  word-break: break-all;
  color: var(--color-text-lighter);
}

.debug-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  z-index: 1000;
  opacity: 0.95;

  &:hover {
    opacity: 1;
  }
}

.debug-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: var(--z-sticky);
}
</style>
