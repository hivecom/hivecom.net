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
  <Card class="kpi-card" :padding="false">
    <Flex column gap="m" expand>
      <Flex gap="m" y-center expand>
        <div v-if="icon" class="kpi-card__icon-container" :class="`kpi-card__icon-container--${variant || 'primary'}`">
          <Icon :name="icon" size="24" />
        </div>
        <Flex class="kpi-card__label" y-center x-between expand>
          {{ label }}
          <div v-if="description" class="kpi-card__description-icon">
            <Tooltip placement="top">
              <Icon name="ph:info" size="18" class="kpi-card__info-icon" />
              <template #tooltip>
                <div class="kpi-card__tooltip-content">
                  {{ description }}
                </div>
              </template>
            </Tooltip>
          </div>
        </Flex>
      </Flex>
      <div class="kpi-card__content">
        <div v-if="isLoading" class="kpi-card__value-container">
          <Skeleton :height="32" width="60%" />
        </div>
        <div v-else class="kpi-card__value-row">
          <div class="kpi-card__value" :class="`kpi-card__value--${variant || 'primary'}`">
            {{ prefix }}{{ value }}{{ suffix }}
          </div>
        </div>
      </div>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.kpi-card {
  padding: var(--space-l);
  height: 100%;
  width: 100%;
  display: flex;

  &__icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    border-radius: var(--border-radius-m);

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

  &__content {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  &__label {
    font-size: var(--font-size-s);
    font-weight: 500;
    color: var(--color-text-light);
  }

  &__value-container {
    margin-top: var(--space-xs);
  }

  &__value-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }

  &__value {
    font-size: var(--font-size-xxl);
    font-weight: 700;
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

  &__description-icon {
    display: flex;
    align-items: center;
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
    font-size: var(--font-size-xs);
    line-height: 1.4;
  }
}
</style>
