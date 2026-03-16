<script setup lang="ts">
import { Card, Flex } from '@dolanske/vui'
import { computed, toRefs } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatTimeAgo } from '@/lib/utils/date'
import TinyBadge from '../Shared/TinyBadge.vue'

interface Props {
  text?: string
  description?: string | null
  icon?: string
  badge?: string | number | null
  highlight?: boolean
  shiny?: boolean
  to?: string | null
  clickable?: boolean
  timestamp?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  description: null,
  icon: undefined,
  badge: null,
  highlight: false,
  shiny: false,
  to: null,
  clickable: false,
  timestamp: null,
})

const slots = defineSlots()

const {
  text,
  description,
  icon,
  badge,
  highlight,
  shiny,
  to,
  clickable,
  timestamp,
} = toRefs(props)

const isClickable = computed(() => Boolean(to.value) || clickable.value)
const isMobile = useBreakpoint('<s')

function handleCardClick() {
  if (!to.value)
    return

  void navigateTo(to.value)
}
</script>

<template>
  <Card
    expand
    :padding="false"
    class="notification-card"
    :class="{
      'notification-card--highlight': highlight,
      'notification-card--shiny': shiny,
      'notification-card--clickable': isClickable,
      'notification-card--hover-actions': !!slots.actions && !isMobile,
    }"
    :tabindex="isClickable ? 0 : undefined"
    :role="isClickable ? 'link' : undefined"
    @click="handleCardClick"
    @keydown.enter.prevent="handleCardClick"
    @keydown.space.prevent="handleCardClick"
  >
    <template #footer />
    <div class="notification-card__row">
      <Flex gap="xs" y-center class="notification-card__main">
        <div
          v-if="icon"
          class="notification-card__icon-container"
          :class="{
            'notification-card__icon-container--highlight': highlight,
            'notification-card__icon-container--shiny': shiny,
          }"
        >
          <Icon :name="icon" :size="20" />
        </div>
        <div v-if="text || description || $slots.below" class="notification-card__text">
          <span v-if="text" class="notification-card__title">{{ text }}</span>
          <span v-if="description" class="notification-card__description">{{ description }}</span>
          <slot name="below" />
        </div>
        <div v-if="slots.default" class="notification-card__extra">
          <slot />
        </div>
        <TinyBadge v-if="badge">
          {{ badge }}
        </TinyBadge>
        <slot name="meta" />
      </Flex>
      <span
        v-if="timestamp"
        class="notification-card__timestamp"
        :class="{ 'notification-card__timestamp--mobile': isMobile }"
      >
        {{ formatTimeAgo(timestamp) }}
      </span>
      <Flex v-if="slots.actions" gap="xxs" class="notification-card__actions">
        <slot name="actions" />
      </Flex>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;
@use '@/assets/breakpoints.scss' as *;

.notification-card {
  position: relative;
  width: 100%;
  background-color: var(--color-bg-medium);

  &--shiny {
    border: none;

    &:after {
      content: '';
      position: absolute;
      inset: 0;
      padding: 1px;
      border-radius: inherit;
      background: var(--shiny-gradient);
      background-size: 200% 200%;
      animation: shinyHueRotate 8s linear infinite;
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }
  }

  &--clickable {
    cursor: pointer;

    &:hover {
      background: var(--color-bg-raised);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 35%, transparent);
    }
  }

  &--hover-actions {
    .notification-card__actions {
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--transition-fast);
    }

    &:hover,
    &:focus-within {
      .notification-card__actions {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }

  &__row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-s);
    position: relative;
    z-index: 1;
    padding-inline: var(--space-xs);
    min-height: 52px;
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    min-width: 32px;
    background-color: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    border: 1px solid var(--color-border);

    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;

    &--highlight {
      background-color: var(--color-accent);
      border-color: color-mix(in srgb, var(--color-accent) 80%, transparent);

      .iconify {
        color: var(--color-text-invert);
      }
    }

    &--shiny {
      background-image: var(--shiny-gradient);
      background-size: 200% 200%;
      animation: shinyHueRotate 8s linear infinite;
      border-color: color-mix(in srgb, #59d7f7 70%, transparent);
      box-shadow: 0 0 12px color-mix(in srgb, #3afea2 35%, transparent);

      .iconify {
        color: var(--color-bg);
      }
    }
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    @include line-clamp(1);
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
  }

  &__description {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    @include line-clamp(1);
  }

  &__timestamp {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lightest);

    &--mobile {
      padding-right: 32px;
    }
  }

  &__extra {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    color: inherit;
    flex-shrink: 0;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding-block: var(--space-s);
    position: absolute;
    top: 50%;
    right: var(--space-xs);
    transform: translateY(-50%);
  }
}
</style>
