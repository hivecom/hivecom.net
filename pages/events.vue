<script setup lang="ts">
import type { Tables } from '~/types/database.types'

import { Divider, Spinner } from '@dolanske/vui'

// Fetch data
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const events = ref<Tables<'events'>[]>()

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
  <div class="page">
    <!-- Hero section -->
    <section>
      <h1>
        Events
      </h1>
      <p>
        Discover the latest happenings and join us in our exciting events.
      </p>
    </section>
    <Divider />
    <section>
      <div v-if="loading">
        <Spinner size="l" />
      </div>
      <div v-else class="grid col-2">
        <Card v-for="event in events" :key="event.id">
          <template #header>
            <h5>{{ event.title }}</h5>
          </template>

          <pre>
          {{ event }}
          </pre>
        </Card>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">

</style>
