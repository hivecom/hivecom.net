<script setup lang="ts">
import type { Database } from '~/types/database.types'

import { Divider, Spinner } from '@dolanske/vui'

// Fetch data
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const events = ref<Database['public']['Tables']['events']['Row'][]>()

onMounted(async () => {
  loading.value = true

  const responseEvents = await supabase.from('events').select('*')
  if (responseEvents.error) {
    errorMessage.value = responseEvents.error.message
    return
  }

  loading.value = false
  events.value = responseEvents.data
})
</script>

<template>
  <!-- Hero section -->
  <section class="section-hero">
    <h1 class="section-hero-title">
      Events
    </h1>
    <p class="section-hero-tagline">
      Discover the latest happenings and join us in our exciting events.
    </p>
  </section>
  <section>
    <div v-if="loading">
      <Spinner size="l" />
    </div>
    <div v-else>
      <Divider />
      <Card>
        <template #header>
          <h5>Profile</h5>
        </template>
        <pre>{{ events?.length ? events : "No events found" }}</pre>
      </Card>
    </div>
  </section>
</template>
