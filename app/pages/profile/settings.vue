<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Card, Divider, Flex, Grid, Skeleton, Toasts } from '@dolanske/vui'
import { computed } from 'vue'
import ChangeEmailCard from '@/components/Settings/ChangeEmailCard.vue'
import ChangePasswordCard from '@/components/Settings/ChangePasswordCard.vue'
import ConnectionsCard from '@/components/Settings/ConnectionsCard.vue'
import DeleteAccountCard from '@/components/Settings/DeleteAccountCard.vue'
import MfaCard from '@/components/Settings/MfaCard.vue'
// import ProfileSummaryCard from '@/components/Settings/ProfileSummaryCard.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()

const profile = ref<Tables<'profiles'> | null>(null)
const loading = ref(true)
const profileError = ref('')
const authReady = ref(false)
const isBelowM = useBreakpoint('<m')
const sectionGridColumns = computed(() => (isBelowM.value ? 1 : 2))

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

onMounted(() => {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    authReady.value = true

    if (event === 'SIGNED_OUT' || (!user.value && authReady.value))
      navigateTo('/auth/sign-in')
  })

  authSubscription = data.subscription

  if (user.value) {
    authReady.value = true
    fetchProfile()
  }
  else {
    setTimeout(() => {
      if (!user.value && authReady.value)
        navigateTo('/auth/sign-in')
    }, 1000)
  }
})

onUnmounted(() => {
  authSubscription?.unsubscribe()
  authSubscription = null
})

watch(user, (newUser) => {
  if (!newUser && authReady.value) {
    profile.value = null
    navigateTo('/auth/sign-in')
  }
  else if (newUser) {
    fetchProfile()
  }
})
</script>

<template>
  <div class="page">
    <template v-if="loading && !authReady">
      <div class="loading-container">
        <Skeleton height="2.5rem" width="60%" style="margin-bottom: var(--space-l);" />

        <Card separators>
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
      <div>Please sign in to access profile settings.</div>
    </template>

    <template v-else>
      <section class="page-title">
        <h1>Settings</h1>
        <p>Manage your account settings and connections.</p>
      </section>

      <Alert v-if="profileError" filled variant="danger" class="profile-error">
        {{ profileError }}
      </Alert>

      <Flex expand column gap="xl">
        <Flex column gap="m" expand y-center>
          <Flex expand gap="m">
            <p class="section-eyebrow">
              Profile
            </p>
            <Divider size="s" class="w-100" />
          </Flex>
          <Flex gap="l" expand y-stretch>
            <!-- <ProfileSummaryCard
              :profile="profile"
              :user-id="userId"
              :loading="loading"
            /> -->
            <ConnectionsCard :profile="profile" @updated="handleProfileUpdated" />
          </Flex>
        </Flex>

        <Flex column gap="m" expand>
          <Flex expand gap="m">
            <p class="section-eyebrow">
              Security
            </p>
            <Divider size="s" class="w-100" />
          </Flex>
          <Grid :columns="sectionGridColumns" gap="l" expand y-stretch>
            <ChangePasswordCard />
            <MfaCard />
          </Grid>
        </Flex>

        <Flex column gap="m" expand>
          <Flex expand gap="m">
            <p class="section-eyebrow">
              Account
            </p>
            <Divider size="s" class="w-100" />
          </Flex>
          <Grid :columns="sectionGridColumns" gap="l" expand y-stretch>
            <ChangeEmailCard />
            <DeleteAccountCard />
          </Grid>
        </Flex>
      </Flex>
    </template>
  </div>
  <Toasts />
</template>

<style lang="scss" scoped>
.section-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-lightest);
  margin-top: var(--space-xxs);
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

@media (max-width: 768px) {
  .loading-container {
    padding: var(--space-l);
  }
}
</style>
