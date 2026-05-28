<script setup lang="ts">
import { Card, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  label: string
  value: string | number
  isLoading?: boolean
  icon?: string
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'gray' | 'info'
  prefix?: string
  suffix?: string
  description?: string
  to?: string
}>()

const isMobile = useBreakpoint('<l')

const linkAttrs = computed(() => {
  if (!props.to)
    return {}
  return {
    href: props.to,
    onClick: (e: MouseEvent) => {
      e.preventDefault()
      navigateTo(props.to)
    },
  }
})
</script>

<template>
  <component
    :is="to ? 'a' : 'div'"
    class="kpi-card__link"
    :class="{ 'kpi-card__link--clickable': !!to }"
    v-bind="linkAttrs"
  >
    <Card class="kpi-card card-bg" :padding="false" expand>
      <Flex column gap="m" expand x-between>
        <!-- Desktop: icon + label top, value bottom -->
        <template v-if="!isMobile">
          <Flex gap="m" y-center expand>
            <Flex gap="m" y-center>
              <div v-if="icon" class="kpi-card__icon-container" :class="`kpi-card__icon-container--${variant || 'primary'}`">
                <Icon :name="icon" size="24" />
              </div>
              <span class="kpi-card__label">{{ label }}</span>
            </Flex>
          </Flex>
          <Flex y-center x-between expand>
            <Skeleton v-if="isLoading" :height="32" width="60%" />
            <div v-else class="kpi-card__value" :class="`kpi-card__value--${variant || 'primary'}`">
              <template v-if="typeof value === 'number'">
                {{ prefix }}<CountDisplay :value="value" class="text-xxl" />{{ suffix }}
              </template>
              <template v-else>
                {{ prefix }}{{ value }}{{ suffix }}
              </template>
            </div>
            <Tooltip v-if="description" placement="top">
              <Icon name="ph:info" size="18" class="kpi-card__info-icon" />
              <template #tooltip>
                <p class="kpi-card__tooltip-content">
                  {{ description }}
                </p>
              </template>
            </Tooltip>
          </Flex>
        </template>

        <!-- Mobile: icon + value top, label + description bottom -->
        <template v-else>
          <Flex gap="m" y-center x-between expand>
            <div v-if="icon" class="kpi-card__icon-container" :class="`kpi-card__icon-container--${variant || 'primary'}`">
              <Icon :name="icon" size="24" />
            </div>
            <Skeleton v-if="isLoading" :height="32" width="60px" />
            <div v-else class="kpi-card__value" :class="`kpi-card__value--${variant || 'primary'}`">
              <template v-if="typeof value === 'number'">
                {{ prefix }}<CountDisplay :value="value" class="text-xxl" />{{ suffix }}
              </template>
              <template v-else>
                {{ prefix }}{{ value }}{{ suffix }}
              </template>
            </div>
          </Flex>
          <Flex column expand :gap="0">
            <span class="kpi-card__label">{{ label }}</span>
            <p v-if="description" class="kpi-card__description">
              {{ description }}
            </p>
          </Flex>
        </template>
      </Flex>
    </Card>
  </component>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.kpi-card {
  padding: var(--space-m);
  height: 100%;
  width: 100%;
  display: flex;

  .vui-card-content {
    width: 100%;
  }

  &__link {
    display: flex;
    flex: 1;
    text-decoration: none;
    border-radius: var(--border-radius-l);

    @media (max-width: #{$breakpoint-m - 1px}) {
      display: block;
      width: 100%;
      flex: unset;
    }

    &--clickable:hover .kpi-card {
      border-color: var(--color-border-strong);
      background: var(--color-bg-raised);
    }
  }

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

    &--info {
      background-color: var(--color-bg-blue-lowered);
      color: var(--color-text-blue);
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

    &--info {
      color: var(--color-text-blue);
    }
  }

  &__info-icon {
    color: var(--color-text-lighter);
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

  &__description {
    margin: var(--space-xs) 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    line-height: 1.4;
  }
}
</style>
