<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import ConnectPatreon from '~/components/Profile/ConnectPatreon.vue'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'

const user = useSupabaseUser()
const profile = ref<Tables<'profiles'>>()

const supabase = useSupabaseClient()

const loading = ref(true)
const errorMessage = ref('')

onMounted(async () => {
  if (!user.value) {
    navigateTo('/auth/sign-in')
    return
  }

  loading.value = true

  const requestProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.value.id)
    .single()

  if (requestProfile.error) {
    errorMessage.value = requestProfile.error.message
    return
  }

  profile.value = requestProfile.data
  loading.value = false
})
</script>

<template>
  <div class="page">
    <div v-if="errorMessage" class="error-container">
      <ErrorAlert :message="errorMessage" />
    </div>

    <div v-else-if="loading" class="loading-container">
      <Loading size="lg" />
    </div>

    <div v-if="!profile" class="error-container">
      <ErrorAlert message="No profile found." />
    </div>

    <Flex v-else column gap="s">
      <h1>{{ profile.username }}</h1>
      <Flex class="w-100" gap="s">
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
            <div>
              <Flex column gap="s">
                <strong>Patreon</strong>
                <div v-if="profile.patreon_id" class="connected">
                  <span class="status-connected">Connected</span>
                  <div class="patreon-id">
                    ID: {{ profile.patreon_id }}
                  </div>
                </div>
                <div>
                  <ConnectPatreon v-if="!profile.patreon_id" />
                  <span v-else class="status-not-connected">Not connected</span>
                </div>
              </Flex>
            </div>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </div>
</template>

<style scoped>
.error-container,
.loading-container {
  display: flex;
  justify-content: center;
  padding: 2rem;
}
</style>
