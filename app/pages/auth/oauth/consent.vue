<script setup lang="ts">
import { Alert, Button, Card, Flex, Spinner } from '@dolanske/vui'
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

const isBelowS = useBreakpoint('<s')
const metaballHeight = computed(() => (isBelowS.value ? '100vh' : 'min(720px, 96vh)'))
const metaballWidth = computed(() => (isBelowS.value ? '100vw' : 'min(520px, 96vw)'))

const authorizationId = computed(() => (typeof route.query.authorization_id === 'string' ? route.query.authorization_id : null))
const hasAuthorizationId = computed(() => Boolean(authorizationId.value))

const loading = ref(false)
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
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    errorMessage.value = error.message
    return false
  }

  if (!data.user) {
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

    if (!data) {
      errorMessage.value = 'Invalid authorization request.'
      details.value = null
      return
    }

    details.value = data as AuthorizationDetails
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load authorization details.'
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
      window.location.assign(redirectTo)
      return
    }

    await navigateTo(redirectTo, { external: true })
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to complete OAuth decision.'
  }
  finally {
    submitting.value = null
  }
}

onMounted(() => {
  if (hasAuthorizationId.value)
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

        <div class="container container-xs" style="min-height:356px">
          <Flex x-center y-center column gap="l" class="py-l">
            <Alert v-if="errorMessage" variant="danger" filled>
              <p class="text-s">
                {{ errorMessage }}
              </p>
            </Alert>

            <template v-else-if="!hasAuthorizationId">
              <Alert variant="info" filled>
                <p class="text-s">
                  Nothing to authorize.
                  This page is only used when an OAuth client redirects here with an <strong class="text-s">authorization_id</strong>.
                </p>
              </Alert>

              <Flex column gap="s" expand>
                <Button expand variant="fill" @click="navigateTo('/')">
                  Go to home
                </Button>
                <Button
                  expand
                  variant="gray"
                  @click="navigateTo({ path: '/auth/sign-in',
                                       query: { redirect: '/' } })"
                >
                  Sign in
                </Button>
              </Flex>
            </template>

            <Flex v-else-if="loading" x-center>
              <Spinner />
            </Flex>

            <template v-else-if="details">
              <Flex column gap="xs" y-center>
                <h5 class="mfa-heading">
                  {{ details.client.name }}
                </h5>
                <p class="text-s text-color-lighter">
                  This app is requesting access to your account.
                </p>
              </Flex>

              <Flex v-if="details.scopes && details.scopes.length" column gap="xs" expand>
                <span class="text-xs text-color-lighter">Requested permissions</span>
                <ul>
                  <li v-for="scope in details.scopes" :key="scope">
                    {{ scope }}
                  </li>
                </ul>
              </Flex>

              <Flex v-if="details.redirect_uri" column gap="xs" expand>
                <span class="text-xs text-color-lighter">Redirect URI</span>
                <div class="text-s text-color-lighter">
                  {{ details.redirect_uri }}
                </div>
              </Flex>

              <Flex column gap="s" expand>
                <Button
                  expand
                  variant="fill"
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
          </Flex>
        </div>
      </Card>
    </MetaballContainer>
    <div class="animated-blob first" />
    <div class="animated-blob second" />
  </Flex>
</template>
