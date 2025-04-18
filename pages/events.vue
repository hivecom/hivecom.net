<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, Divider, Flex, Grid, Sheet, Spinner } from '@dolanske/vui'
import Event from '~/components/Events/Event.vue'

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

// Display more event information, if there's any
const activeEvent = shallowRef<Tables<'events'>>()
const showDetails = computed({
  // Open sheet when an active event is set
  get: () => !!activeEvent.value,
  // Clear active event when sheet is closed
  set: (v) => {
    if (!v) {
      activeEvent.value = undefined
    }
  },
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
    <section class="mt-xl">
      <div v-if="loading">
        <Spinner size="l" />
      </div>
      <template v-else>
        <Flex gap="xxl">
          <Grid :columns="4" gap="l" class="event-item-countdown">
            <span class="color-text-lighter text-s">Days</span>
            <span class="color-text-lighter text-s">Hours</span>
            <span class="color-text-lighter text-s">Minutes</span>
            <span class="color-text-lighter text-s">Seconds</span>
          </Grid>
          <div class="flex-1">
            <span class="color-text-lighter text-s">Event</span>
          </div>
        </Flex>

        <div class="event-list">
          <Event
            v-for="(event, index) in events"
            :key="event.id"
            :data="event"
            :index
            @open="activeEvent = event"
          />
        </div>
      </template>
    </section>

    <Sheet v-model="showDetails" size="512">
      <template #header>
        <h3 class="text-bold text-l">
          {{ activeEvent?.title }}
        </h3>
      </template>

      <p>Markdown will be rendered here and more details will be added too.</p>
    </Sheet>
  </div>
</template>

<style lang="scss">
.event-list {
  .vui-divider:last-of-type {
    display: none;
  }
}

.event-item-countdown {
  span {
    text-align: center;
    display: block;
    width: 56px;
  }
}
</style>
