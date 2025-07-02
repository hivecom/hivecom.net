<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex, Skeleton } from '@dolanske/vui'

// Async component
const ConnectPatreonButton = defineAsyncComponent(() => import('@/components/Profile/ConnectPatreon.vue'))

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const profile = ref<Tables<'profiles'> | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const authReady = ref(false)

// Authentication check - redirect if not signed in
onMounted(() => {
  const authListener = supabase.auth.onAuthStateChange((event, _session) => {
    authReady.value = true

    if (event === 'SIGNED_OUT' || (!user.value && authReady.value)) {
      navigateTo('/auth/sign-in')
    }
  })

  // Cleanup listener on component unmount
  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  // Try to determine auth state immediately if user is already available
  if (user.value) {
    authReady.value = true
    fetchProfile()
  }
  else {
    // Set a timeout to check if we're still loading after a reasonable time
    setTimeout(() => {
      if (!user.value && authReady.value) {
        navigateTo('/auth/sign-in')
      }
    }, 1000)
  }
})

// Watch for user changes
watch(user, (newUser) => {
  if (!newUser && authReady.value) {
    navigateTo('/auth/sign-in')
  }
  else if (newUser) {
    fetchProfile()
  }
})

// Fetch user's profile data
async function fetchProfile() {
  if (!user.value) {
    loading.value = false
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()

    if (error) {
      throw error
    }

    profile.value = data
  }
  catch (error: unknown) {
    console.error('Error fetching profile:', error)
    errorMessage.value = (error as Error).message || 'Failed to load profile'
  }
  finally {
    loading.value = false
  }
}
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
            <!-- Account connection row skeletons -->
            <div v-for="i in 3" :key="i" class="account-connection-row">
              <Flex x-between y-center expand>
                <Flex gap="m" y-center>
                  <Skeleton width="40px" height="40px" style="border-radius: var(--border-radius-m);" />
                  <div>
                    <Skeleton height="1.2rem" width="6rem" style="margin-bottom: var(--space-xs);" />
                    <Skeleton height="0.8rem" width="12rem" />
                  </div>
                </Flex>
                <Skeleton height="2rem" width="5rem" style="border-radius: 1rem;" />
              </Flex>
            </div>
          </Flex>
        </Card>
      </div>
    </template>

    <template v-else-if="!user">
      <div>Please sign in to access profile settings.</div>
    </template>

    <template v-else>
      <h1 class="settings-title">
        Profile Settings
      </h1>

      <!-- Connected Accounts Section -->
      <Card separators>
        <template #header>
          <Flex x-between y-center>
            <h3>Connected Accounts</h3>
            <Icon name="ph:link" />
          </Flex>
        </template>

        <Flex column gap="m">
          <!-- Patreon -->
          <Flex expand class="account-connection-row">
            <Flex x-between y-center expand>
              <Flex gap="m" y-center>
                <div class="account-icon patreon">
                  <Icon name="ph:patreon-logo" size="20" />
                </div>
                <div>
                  <strong>Patreon</strong>
                  <p class="text-xs color-text-lighter">
                    Support the community and get supporter benefits
                  </p>
                </div>
              </Flex>

              <div class="account-status">
                <Badge v-if="profile?.patreon_id" variant="success" size="s">
                  <Icon name="ph:check" />
                  Connected
                </Badge>
                <ClientOnly v-else>
                  <ConnectPatreonButton />
                </ClientOnly>
              </div>
            </Flex>
          </Flex>

          <!-- Steam -->
          <Flex expand class="account-connection-row">
            <Flex x-between y-center expand>
              <Flex gap="m" y-center>
                <div class="account-icon steam">
                  <Icon name="ph:game-controller" size="20" />
                </div>
                <div>
                  <strong>Steam</strong>
                  <p class="text-xs color-text-lighter">
                    Connect your gaming profile
                  </p>
                </div>
              </Flex>

              <div class="account-status">
                <Badge v-if="profile?.steam_id" variant="success" size="s">
                  <Icon name="ph:check" />
                  Connected
                </Badge>
                <Button v-else size="s" variant="gray" disabled aria-label="Steam integration coming soon">
                  Coming Soon
                </Button>
              </div>
            </Flex>
          </Flex>

          <!-- Discord -->
          <Flex expand class="account-connection-row">
            <Flex x-between y-center expand>
              <Flex gap="m" y-center>
                <div class="account-icon discord">
                  <Icon name="ph:discord-logo" size="20" />
                </div>
                <div>
                  <strong>Discord</strong>
                  <p class="text-xs color-text-lighter">
                    Join our community chat
                  </p>
                </div>
              </Flex>

              <div class="account-status">
                <Badge v-if="profile?.discord_id" variant="success" size="s">
                  <Icon name="ph:check" />
                  Connected
                </Badge>
                <Button v-else size="s" variant="gray" disabled aria-label="Discord integration coming soon">
                  Coming Soon
                </Button>
              </div>
            </Flex>
          </Flex>
        </Flex>
      </Card>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.settings-title {
  margin-bottom: var(--space-l);
  color: var(--color-text);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
}

.loading-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-xl);
}

.account-connection-row {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-subtle);

  .account-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--border-radius-m);
    flex-shrink: 0;

    &.patreon {
      background: linear-gradient(135deg, #ff424d 0%, #ff8a00 100%);
      color: white;
    }

    &.steam {
      background: linear-gradient(135deg, #171a21 0%, #2a475e 100%);
      color: white;
    }

    &.discord {
      background: linear-gradient(135deg, #5865f2 0%, #7289da 100%);
      color: white;
    }
  }

  .account-status {
    flex-shrink: 0;
  }
}

@media (max-width: 768px) {
  .profile-settings {
    padding: var(--space-m);
  }

  .account-connection-row {
    padding: var(--space-s);

    .account-icon {
      width: 32px;
      height: 32px;
    }
  }
}
</style>
