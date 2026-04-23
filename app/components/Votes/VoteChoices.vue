<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Checkbox, Flex, Radio } from '@dolanske/vui'

import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  referendum: Tables<'referendums'>
  selectedChoices: number[]
  hasVoted: boolean
  isSubmitting: boolean
  isRemovingVote: boolean
}>()

const emit = defineEmits<{
  choiceClick: [index: number]
  submit: []
  requestRemoveVote: []
}>()

const isBelowSmall = useBreakpoint('<s')
const user = useSupabaseUser()
</script>

<template>
  <div>
    <!-- Voting section -->
    <section v-if="user" class="mb-xl">
      <Card class="card-bg" :class="{ 'p-l': !isBelowSmall }">
        <template #header>
          <h3>
            Cast your vote
          </h3>
        </template>

        <template #header-end>
          <Badge v-if="props.hasVoted" variant="success">
            <Icon name="ph:check-circle" class="text-color-accent" />
            <span class="text-s text-color-accent flex items-center">
              You have voted
            </span>
          </Badge>
        </template>

        <div class="choices-voting my-l">
          <button
            v-for="(choice, index) in props.referendum.choices"
            :key="index"
            class="choice-voting"
            :class="{ selected: props.selectedChoices.includes(index) }"
            @click="emit('choiceClick', index)"
          >
            <!-- To make whole button clickable, checkbox / radio are only fols -->
            <Checkbox
              v-if="props.referendum.multiple_choice"
              :model-value="props.selectedChoices.includes(index)"
              :label="choice"
              inert
            />
            <Radio
              v-else
              :model-value="props.selectedChoices[0]"
              :value="index"
              :label="choice"
              inert
            />
          </button>
        </div>

        <Flex y-center x-between expand :column="isBelowSmall" gap="xl">
          <Flex gap="s" y-center wrap :expand="isBelowSmall" :column="isBelowSmall">
            <Button
              variant="accent"
              :disabled="props.selectedChoices.length === 0 || props.isSubmitting"
              :loading="props.isSubmitting"
              :expand="isBelowSmall"
              @click="emit('submit')"
            >
              <template #start>
                <Icon name="ph:check" />
              </template>
              {{ props.hasVoted ? 'Update Vote' : 'Submit Vote' }}
            </Button>

            <Button
              v-if="props.hasVoted"
              variant="danger"
              plain
              :disabled="props.isSubmitting || props.isRemovingVote"
              :loading="props.isRemovingVote"
              :expand="isBelowSmall"
              @click="emit('requestRemoveVote')"
            >
              <template #start>
                <Icon name="ph:trash" />
              </template>
              Remove Vote
            </Button>
          </Flex>
        </Flex>
      </Card>
    </section>

    <!-- Login prompt -->
    <section v-else class="mb-xl">
      <Card class="text-center" :class="{ 'p-l': !isBelowSmall }">
        <Icon name="ph:sign-in" size="2rem" class="text-color-light mb-m" />
        <h3 class="mb-s">
          Sign in to vote
        </h3>
        <p class="text-color-light mb-l">
          You need to be logged in to participate in this vote.
        </p>
        <NuxtLink to="/auth/sign-in">
          <Button variant="accent">
            Sign In
          </Button>
        </NuxtLink>
      </Card>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.choices-voting {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.choice-voting {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  cursor: pointer;
  transition: var(--transition-fast);

  :deep(.vui-radio input + label),
  :deep(.vui-checkbox input + label) {
    gap: var(--space-m);
    text-align: left;
  }

  &:hover {
    background-color: var(--color-bg-lowered);
    border-color: var(--color-accent);
  }

  &.selected {
    background-color: var(--color-accent-bg);
    border-color: var(--color-accent);
  }
}

@media (max-width: $breakpoint-s) {
  :deep(.vui-card .vui-card-header) {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-s);
  }
}
</style>
