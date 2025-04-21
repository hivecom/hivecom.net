<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, Divider, Flex, Grid } from '@dolanske/vui'

const props = defineProps<{
  data: Tables<'events'>
  index: number
}>()

const emit = defineEmits<{
  open: []
}>()

const countdown = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
})

function updateTime() {
  const now = new Date()
  const eventDate = new Date(props.data.date)
  const diff = eventDate.getTime() - now.getTime()

  if (diff <= 0) {
    countdown.value = {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }

    return
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  countdown.value = {
    days,
    hours,
    minutes,
    seconds,
  }
}

useIntervalFn(updateTime, 1000, { immediate: true })
updateTime()
</script>

<template>
  <Flex gap="xxl" class="event-item" :class="{ 'event-item-first': index === 0 }">
    <Grid :columns="4" gap="l" class="event-item-countdown">
      <span class="text-bold text-xxxl">{{ countdown.days }}</span>
      <span class="text-bold text-xxxl">{{ countdown.hours }}</span>
      <span class="text-bold text-xxxl">{{ countdown.minutes }}</span>
      <span class="text-bold text-xxxl">{{ index === 0 ? countdown.seconds : '' }}</span>
    </Grid>

    <div class="flex-1">
      <h5 class="mb-xs">
        {{ props.data.title }}
      </h5>
      <p class="mb-m">
        {{ props.data.description }}
      </p>
      <Badge v-if="props.data.location" variant="accent">
        <Icon name="ph:map-pin-fill" />
        {{ props.data.location }}
      </Badge>
    </div>

    <Button outline size="s" @click="emit('open')">
      Details
      <template #end>
        <Icon name="ph:caret-right" />
      </template>
    </Button>
  </Flex>

  <Divider />
</template>

<style lang="scss" scoped>
.event-item {
  padding-block: var(--space-xl);
  &-first {
    span {
      color: var(--color-accent);
    }
  }

  &-countdown {
    span {
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
