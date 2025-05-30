<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex, Spinner } from '@dolanske/vui'
import ConnectPatreon from '~/components/Profile/ConnectPatreon.vue'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'

interface Props {
  userId: string
  isOwnProfile?: boolean
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const profile = ref<Tables<'profiles'>>()
const loading = ref(true)
const errorMessage = ref('')

async function fetchProfile() {
  loading.value = true
  errorMessage.value = ''

  if (!props.userId) {
    errorMessage.value = 'No user ID provided'
    loading.value = false
    return
  }

  const requestProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', props.userId)
    .single()

  if (requestProfile.error) {
    errorMessage.value = requestProfile.error.message
    loading.value = false
    return
  }

  profile.value = requestProfile.data
  loading.value = false
}

onMounted(() => {
  fetchProfile()
})

// Watch for userId changes (useful when navigating between different profiles)
watch(() => props.userId, () => {
  if (props.userId) {
    fetchProfile()
  }
})
</script>

<template>
  <div class="profile-view">
    <template v-if="loading">
      <Spinner size="l" />
    </template>

    <template v-else>
      <div v-if="errorMessage">
        <ErrorAlert :message="errorMessage" />
      </div>

      <div v-else-if="!profile">
        <ErrorAlert message="No profile found." />
      </div>

      <Flex v-else column gap="s">
        <h1>{{ profile.username }}</h1>
        <Flex expand gap="s">
          <Card class="w-100">
            <template #header>
              <h2>
                {{ profile.title }}
              </h2>
            </template>
            <h5>{{ profile.subtitle }}</h5>
          </Card>

          <Card class="w-full">
            <template #header>
              <h5>Connected Accounts</h5>
            </template>
            <Flex column gap="s">
              <Flex expand y-center x-between gap="s">
                <strong>Patreon</strong>
                <span v-if="profile.patreon_id">Connected ({{ profile.patreon_id }})</span>
                <!-- Only show connect button for own profile -->
                <ConnectPatreon v-else-if="isOwnProfile" />
                <span v-else>Not connected</span>
              </Flex>
            </Flex>
          </Card>
        </Flex>
      </Flex>
    </template>
  </div>
</template>

<style scoped>
.profile-view {
  width: 100%;
}
</style>
