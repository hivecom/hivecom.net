<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Badge, Flex } from '@dolanske/vui'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

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
    <Flex y-center x-between gap="m" expand class="mb-m">
      <h1 class="m-0">
        {{ props.referendum.title }}
      </h1>
      <UserDisplay :user-id="referendum.created_by" size="m" :show-profile-preview="true" :hide-avatar="false" />
    </Flex>

    <p v-if="props.referendum.description" class="text-l text-color-light mb-m">
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

        <Badge v-if="!props.referendum.is_public" variant="neutral">
          <Icon name="ph:lock" />
          Private
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

<style scoped lang="scss">
h1 {
  font-size: var(--font-size-xxxl);
}

.vote-header {
  &__organizer {
    &-label {
      font-size: var(--font-size-s);
      color: var(--color-text-lighter);
    }
  }
}
</style>
