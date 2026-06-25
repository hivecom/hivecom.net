<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Card, DropdownItem, Flex, Skeleton } from '@dolanske/vui'
import { useIntersectionObserver } from '@vueuse/core'
import ChangeEmailCard from '@/components/Settings/ChangeEmailCard.vue'
import ChangePasswordCard from '@/components/Settings/ChangePasswordCard.vue'
import ConnectionsCard from '@/components/Settings/ConnectionsCard.vue'
import DeleteAccountCard from '@/components/Settings/DeleteAccountCard.vue'
import GeneralUserSettings from '@/components/Settings/GeneralUserSettings.vue'
import MfaCard from '@/components/Settings/MfaCard.vue'
import PasskeyCard from '@/components/Settings/PasskeyCard.vue'
import RichPresencePromptModal from '@/components/Settings/RichPresencePromptModal.vue'
import { useSessionReady } from '@/composables/useSessionReady'
import { scrollToId } from '@/lib/utils/common'

const route = useRoute()

// Surfaced as subtle diagnostic text so users can read out which deploy they're
// on when reporting a stale-build / stuck-loading issue.
const buildId = useRuntimeConfig().app.buildId

const richPresencePromptOpen = ref(false)

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { waitForSessionReady } = useSessionReady()
const userId = useUserId()
const { navigateToSignIn } = useAuthRedirect()

const profile = ref<Tables<'profiles'> | null>(null)

function maybePromptRichPresence() {
  if (!profile.value?.rich_presence_enabled) {
    richPresencePromptOpen.value = true
  }
}
const loading = ref(true)
const profileError = ref('')
const authReady = ref(false)

async function fetchProfile() {
  if (!user.value) {
    profile.value = null
    loading.value = false
    return
  }

  loading.value = true
  profileError.value = ''

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId.value)
      .single()

    if (error)
      throw error

    profile.value = data
  }
  catch (error) {
    profileError.value = error instanceof Error ? error.message : 'Failed to load profile.'
    profile.value = null
  }
  finally {
    loading.value = false
  }
}

function handleProfileUpdated() {
  fetchProfile()
}

let authSubscription: { unsubscribe: () => void } | null = null

onBeforeMount(async () => {
  await waitForSessionReady()
  authReady.value = true

  if (!user.value) {
    navigateToSignIn()
    return
  }

  await fetchProfile()

  if (route.query.connected === 'steam') {
    maybePromptRichPresence()
    // Clean query param without navigation
    const url = new URL(window.location.href)
    url.searchParams.delete('connected')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
  }

  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' || !user.value)
      navigateToSignIn()
  })

  authSubscription = data.subscription
})

onUnmounted(() => {
  authSubscription?.unsubscribe()
  authSubscription = null
})

watch(user, (newUser) => {
  if (newUser) {
    fetchProfile()
  }
})

const sections = [
  { id: 'general', label: 'General' },
  { id: 'connections', label: 'Connections' },
  { id: 'security', label: 'Security' },
  { id: 'account', label: 'Account' },
] as const

type SectionId = typeof sections[number]['id']

const activeSection = ref<SectionId>('general')
const sectionVisibility = reactive<Record<SectionId, boolean>>(
  Object.fromEntries(sections.map(({ id }) => [id, false])) as Record<SectionId, boolean>,
)

// This function is passed via `ref` to a child component. WHen that component
// is first mounted, this function calls and we can register the intersection
// observer. This way we do not need separate logic from the template
function registerScrollListener() {
  nextTick(() => {
    for (const { id } of sections) {
      const el = document
        .getElementById(id)
        ?.querySelector('h4')

      if (!el)
        continue

      useIntersectionObserver(
        el,
        ([entry]) => {
          if (!entry)
            return

          sectionVisibility[id] = entry.isIntersecting
          const firstVisible = sections.find(s => sectionVisibility[s.id])?.id
          if (firstVisible)
            activeSection.value = firstVisible
        },
        { threshold: 0, rootMargin: '0px 0px -70% 0px' },
      )
    }
  })
}
</script>

<template>
  <div class="page container-m">
    <template v-if="loading && !authReady">
      <div class="loading-container">
        <Skeleton height="2.5rem" width="60%" style="margin-bottom: var(--space-l);" />

        <Card separators class="card-bg">
          <template #header>
            <Flex x-between y-center>
              <Skeleton height="1.5rem" width="10rem" />
              <Skeleton width="1.5rem" height="1.5rem" />
            </Flex>
          </template>

          <Flex column gap="m">
            <Flex v-for="i in 3" :key="i" x-between y-center class="loading-row">
              <Flex gap="m" y-center>
                <Skeleton width="40px" height="40px" style="border-radius: var(--border-radius-m);" />
                <div>
                  <Skeleton height="1.2rem" width="6rem" style="margin-bottom: var(--space-xs);" />
                  <Skeleton height="0.8rem" width="12rem" />
                </div>
              </Flex>
              <Skeleton height="2rem" width="5rem" style="border-radius: 1rem;" />
            </Flex>
          </Flex>
        </Card>
      </div>
    </template>

    <template v-else-if="!user">
      <p>Please sign in to access profile settings.</p>
    </template>

    <template v-else>
      <section :ref="registerScrollListener" class="page-title">
        <h1>Settings</h1>
        <p>Manage your account settings and connections.</p>
      </section>

      <Alert v-if="profileError" filled variant="danger" class="profile-error">
        {{ profileError }}
      </Alert>

      <div class="settings">
        <Flex expand column gap="xxxl" class="settings__container">
          <div id="general" class="w-100">
            <GeneralUserSettings class="mb-m" />
          </div>
          <div id="connections" class="w-100">
            <ConnectionsCard :profile="profile" @updated="handleProfileUpdated" @connected="maybePromptRichPresence" />
          </div>
          <div id="security" class="w-100">
            <strong class="block mb-m text-color-light">
              Security
            </strong>
            <Flex column gap="xl">
              <ChangePasswordCard />
              <MfaCard />
              <PasskeyCard />
            </Flex>
          </div>
          <div id="account" class="w-100">
            <strong class="block mb-m text-color-light">Account</strong>
            <Flex column gap="xl">
              <ChangeEmailCard />
              <DeleteAccountCard />
            </Flex>

            <p v-if="buildId" class="settings-build-id">
              Latest Build Identifier: {{ buildId }}
            </p>
          </div>
        </Flex>

        <div class="settings__nav">
          <div class="settings__nav--inner">
            <DropdownItem
              v-for="section in sections"
              :key="section.id"
              expand
              :class="{ active: activeSection === section.id }"
              @click="scrollToId(`#${section.id}`, 'center')"
            >
              {{ section.label }}
            </DropdownItem>
          </div>
        </div>
      </div>
    </template>

    <RichPresencePromptModal
      :open="richPresencePromptOpen"
      @close="richPresencePromptOpen = false"
      @enabled="handleProfileUpdated"
    />
  </div>
</template>

<style lang="scss" scoped>
.section-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-lightest);
  margin-top: var(--space-xxs);
}

:deep(h4) {
  font-weight: var(--font-weight-bold);
}

.loading-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-xl);
}

.loading-row {
  padding: var(--space-s) 0;
}
.profile-error {
  margin-bottom: var(--space-m);
}

.settings-build-id {
  margin-top: var(--space-xs);
  font-size: var(--font-size-xxs);
  color: var(--color-text-lightest);
  user-select: text;
}

.settings {
  display: grid;
  grid-template-columns: 1fr 192px;
  gap: var(--space-l);
  max-width: 982px;

  &__nav {
    position: relative;

    &--inner {
      position: sticky;
      top: calc(64px + var(--space-s));

      :deep(.vui-dropdown-item.active) {
        background-color: var(--color-bg-raised);

        .vui-dropdown-item-slot {
          color: var(--color-accent) !important;
        }
      }
    }
  }
}

@media (max-width: 768px) {
  .settings {
    display: block;

    &__nav {
      display: none;
    }
  }

  .loading-container {
    padding: var(--space-l);
  }
}
</style>
