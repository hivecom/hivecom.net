<script setup lang="ts">
import { Badge, Card, Flex } from '@dolanske/vui'
import { computed, toRefs, useSlots } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatTimeAgo } from '@/lib/utils/date'

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

const slots = useSlots()
const hasInlineContent = computed(() => Boolean(slots.default))
const hasActions = computed(() => Boolean(slots.actions))
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
      'notification-card--hover-actions': hasActions && !isMobile,
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
        <Flex
          v-if="icon"
          class="notification-card__icon-container"
          :class="{
            'notification-card__icon-container--highlight': highlight,
            'notification-card__icon-container--shiny': shiny,
          }"
        >
          <Icon :name="icon" class="notification-card__icon" />
        </Flex>
        <div v-if="text || description || timestamp || $slots.below" class="notification-card__text">
          <span v-if="text" class="notification-card__title">{{ text }}</span>
          <span v-if="description" class="notification-card__description">{{ description }}</span>
          <span v-if="timestamp" class="notification-card__timestamp">{{ formatTimeAgo(timestamp) }}</span>
          <slot name="below" />
        </div>
        <div v-if="hasInlineContent" class="notification-card__extra">
          <slot />
        </div>
        <Badge v-if="badge" size="s" class="notification-card__badge">
          {{ badge }}
        </Badge>
        <slot name="meta" />
      </Flex>

      <Flex v-if="hasActions" gap="xxs" class="notification-card__actions">
        <slot name="actions" />
      </Flex>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
.notification-card {
  position: relative;
  z-index: var(--z-toast); // lift stacking context so tooltip can clear dropdown header
  width: 100%;
  padding: var(--space-2xs) var(--space-m);
  background: var(--color-bg-subtle);
  overflow: visible; // allow floating elements (tooltips) to escape the card

  &--highlight {
    border-left: 3px solid var(--color-accent);
  }

  &--shiny {
    border: none;

    &::after {
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
      z-index: -1;
    }
  }

  &--highlight.notification-card--shiny {
    border: none;
  }

  &--clickable {
    cursor: pointer;

    &:hover {
      background: var(--color-bg-medium);
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
    // Ensure the right edge of badge/extra/actions has breathing room
    padding-right: var(--space-s);
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__icon {
    font-size: 20px;
  }

  &__icon-container {
    padding: var(--space-m);
    background-color: var(--color-bg-raised);
    border-right: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    border-radius: var(--border-radius-s);
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
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
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-left: var(--space-s);
  }

  &__title {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__description {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__timestamp {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    opacity: 0.7;
  }

  &__badge {
    margin-left: auto;
    flex-shrink: 0;
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
    padding: var(--space-s) 0;
    flex-shrink: 0;
  }
}
</style>
