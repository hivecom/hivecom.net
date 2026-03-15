<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Badge, Flex } from '@dolanske/vui'

const props = defineProps<{
  referendum: Tables<'referendums'>
  isActive: boolean
  isUpcoming: boolean
  statusVariant: 'success' | 'warning' | 'neutral'
  statusLabel: string
  totalVoters: number
  timeRemaining: string
  timeUntilStart: string
  timeAgo: string
}>()
</script>

<template>
  <section class="mb-l">
    <Flex y-start x-between gap="xl" expand>
      <h1>
        {{ props.referendum.title }}
      </h1>
    </Flex>

    <p v-if="props.referendum.description" class="text-xl text-color-light mb-xl">
      {{ props.referendum.description }}
    </p>

    <Flex x-between y-center expand class="mt-m" wrap>
      <Flex gap="xs" wrap>
        <Badge :variant="props.statusVariant">
          {{ props.statusLabel }}
        </Badge>

        <Badge v-if="props.referendum.multiple_choice">
          Multiple Choice
        </Badge>
        <Badge v-else>
          Single Choice
        </Badge>

        <Badge v-if="!props.isUpcoming">
          {{ props.totalVoters }} vote{{ props.totalVoters !== 1 ? 's' : '' }}
        </Badge>
      </Flex>

      <Flex v-if="props.isActive" gap="xxs" y-center>
        <Icon name="ph:clock" />
        <p class="flex align-center text-s text-color-light">
          {{ props.timeRemaining }}
        </p>
      </Flex>
      <Flex v-else-if="props.isUpcoming" gap="s" y-center>
        <Icon name="ph:calendar" />
        <p class="text-s text-color-light">
          {{ props.timeUntilStart }}
        </p>
      </Flex>
      <Flex v-else gap="s" y-center>
        <Icon name="ph:calendar" />
        <p class="text-s text-color-light">
          {{ props.timeAgo }}
        </p>
      </Flex>
    </Flex>
  </section>
</template>
