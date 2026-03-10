<script setup lang="ts">
import { Card, Flex, Skeleton, Tooltip } from '@dolanske/vui'

defineProps<{
  label: string
  value: string | number
  isLoading?: boolean
  icon?: string
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'gray'
  prefix?: string
  suffix?: string
  description?: string
}>()
</script>

<template>
  <Card class="kpi-card card-bg" :padding="false">
    <Flex column gap="m" expand>
      <Flex gap="m" y-center expand>
        <div v-if="icon" class="kpi-card__icon-container" :class="`kpi-card__icon-container--${variant || 'primary'}`">
          <Icon :name="icon" size="24" />
        </div>
        <Flex class="kpi-card__label" y-center x-between expand>
          {{ label }}
          <Flex v-if="description" y-center>
            <Tooltip placement="top">
              <Icon name="ph:info" size="18" class="kpi-card__info-icon" />
              <template #tooltip>
                <p class="kpi-card__tooltip-content">
                  {{ description }}
                </p>
              </template>
            </Tooltip>
          </Flex>
        </Flex>
      </Flex>
      <Flex column expand>
        <Skeleton v-if="isLoading" :height="32" width="60%" class="mt-xs" />
        <Flex v-else y-center gap="xs" class="mt-xs">
          <div class="kpi-card__value" :class="`kpi-card__value--${variant || 'primary'}`">
            {{ prefix }}{{ value }}{{ suffix }}
          </div>
        </Flex>
      </Flex>
    </Flex>
  </Card>
</template>

<style lang="scss">
.kpi-card {
  padding: var(--space-m);
  height: 100%;
  width: 100%;
  display: flex;

  &__icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: var(--border-radius-m);

    .iconify {
      color: white;
    }

    &--primary,
    &--success {
      background-color: var(--color-bg-green-lowered);
      color: var(--color-text-green);
    }

    &--warning {
      background-color: var(--color-bg-yellow-lowered);
      color: var(--color-text-yellow);
    }

    &--danger {
      background-color: var(--color-bg-red-lowered);
      color: var(--color-text-red);
    }

    &--gray {
      background-color: var(--color-bg-medium);
      color: var(--color-text-light);
    }
  }

  &__label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
    line-height: 1.5em;
  }

  &__value {
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-bold);
    line-height: 1.2;

    &--primary,
    &--success {
      color: var(--color-text-green);
    }

    &--warning {
      color: var(--color-text-yellow);
    }

    &--danger {
      color: var(--color-text-red);
    }

    &--gray {
      color: var(--color-text);
    }
  }

  &__info-icon {
    color: var(--color-text-light);
    opacity: 0.7;
    cursor: help;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 1;
    }
  }

  &__tooltip-content {
    max-width: 250px;
    font-size: var(--font-size-s);
    line-height: 1.4;
  }
}
</style>
