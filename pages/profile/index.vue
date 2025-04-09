<script setup lang="ts">
import type { Database } from '~/types/database.types'

import { Card } from '@dolanske/vui'

// Fetch data
const user = useSupabaseUser()

const profile = ref<Database['public']['Tables']['profiles']['Row']>()

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
  <h1>Profile</h1>

  <Card>
    <template #header>
      <h5>Profile</h5>
    </template>
    <pre>{{ profile || "Looks like you don't have a profile yet!" }}</pre>
  </Card>

  <Card>
    <template #header>
      <h5>{{ user?.email }}</h5>
    </template>
    <pre>{{ user }}</pre>
  </Card>
</template>
