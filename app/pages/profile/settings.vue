<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Card, DropdownItem, Flex, Skeleton } from '@dolanske/vui'
import { useIntersectionObserver } from '@vueuse/core'
import ChangeEmailCard from '@/components/Settings/ChangeEmailCard.vue'
import ChangePasswordCard from '@/components/Settings/ChangePasswordCard.vue'
import ConnectionsCard from '@/components/Settings/ConnectionsCard.vue'
import DeleteAccountCard from '@/components/Settings/DeleteAccountCard.vue'
import GeneralAppearanceSettings from '@/components/Settings/GeneralAppearanceSettings.vue'
import GeneralUserSettings from '@/components/Settings/GeneralUserSettings.vue'
import MfaCard from '@/components/Settings/MfaCard.vue'
import PasskeyCard from '@/components/Settings/PasskeyCard.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { scrollToId } from '@/lib/utils/common'

const isMobile = useBreakpoint('<s')
const isDev = import.meta.dev

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()
const { navigateToSignIn } = useAuthRedirect()

const profile = ref<Tables<'profiles'> | null>(null)
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

onBeforeMount(() => {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    authReady.value = true

    if (event === 'SIGNED_OUT' || (!user.value && authReady.value))
      navigateToSignIn()
  })

  authSubscription = data.subscription

  if (user.value) {
    authReady.value = true
    fetchProfile()
  }
  else {
    setTimeout(() => {
      if (!user.value && authReady.value)
        navigateToSignIn()
    }, 1000)
  }
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

onMounted(() => {
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
</script>

<template>
  <div :class="`page ${isMobile ? '' : 'container container-m'}` ">
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
      <section class="page-title">
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
            <GeneralAppearanceSettings />
          </div>
          <div id="connections" class="w-100">
            <ConnectionsCard :profile="profile" @updated="handleProfileUpdated" />
          </div>
          <div id="security" class="w-100">
            <strong class="block mb-m text-color-light">
              Security
            </strong>
            <Flex column gap="xl">
              <ChangePasswordCard />
              <MfaCard />
              <PasskeyCard v-if="isDev" />
            </Flex>
          </div>
          <div id="account" class="w-100">
            <strong class="block mb-m text-color-light">Account</strong>
            <Flex column gap="xl">
              <ChangeEmailCard />
              <DeleteAccountCard />
            </Flex>
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
