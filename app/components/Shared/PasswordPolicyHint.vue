<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { PASSWORD_RULES } from '@/lib/utils/password'

const props = defineProps<{
  password?: string
}>()

const checkedRules = computed(() =>
  PASSWORD_RULES.map(rule => ({
    ...rule,
    met: props.password != null ? rule.test(props.password) : false,
  })),
)

const anyTyped = computed(() => (props.password?.length ?? 0) > 0)
</script>

<template>
  <div class="password-policy-hint">
    <p class="password-policy-hint__title">
      Password requirements
    </p>
    <Flex column gap="xxs" class="password-policy-hint__list">
      <Flex
        v-for="rule in checkedRules"
        :key="rule.key"
        y-center
        gap="xs"
        class="password-policy-hint__rule"
        :class="{
          'is-met': anyTyped && rule.met,
          'is-unmet': anyTyped && !rule.met,
        }"
      >
        <Icon
          :name="anyTyped && rule.met ? 'ph:check-circle-fill' : 'ph:circle'"
          class="password-policy-hint__icon"
          size="14"
        />
        <span class="password-policy-hint__label">{{ rule.label }}</span>
      </Flex>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.password-policy-hint {
  width: 100%;

  &__title {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-xxs);
    font-weight: var(--font-weight-medium);
  }

  &__list {
    width: 100%;
  }

  &__rule {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    transition: color var(--transition);

    &.is-met {
      color: var(--color-text-green);
    }

    &.is-unmet {
      color: var(--color-text-red);
    }
  }

  &__icon {
    flex-shrink: 0;
  }

  &__label {
    line-height: 1.3;
  }
}
</style>
