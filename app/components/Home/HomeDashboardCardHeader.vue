<script setup lang="ts">
import { Flex } from '@dolanske/vui'

// Title row for a dashboard card. The default slot sits flush right of the
// title, which is where cards put their at-a-glance badge (players online,
// votes in progress). Pass `to` and the title doubles as the way into the
// section the card is summarising. The icon matches whatever the section uses
// in the nav, so a card is recognisable before the title is read.
defineProps<{ title: string, icon?: string, to?: string }>()
</script>

<template>
  <Flex x-between y-center gap="s" expand class="dashboard-card-header">
    <h2 class="dashboard-card-header__title">
      <NuxtLink v-if="to" :to="to" class="dashboard-card-header__link">
        <Icon v-if="icon" :name="icon" class="dashboard-card-header__icon" />
        {{ title }}
        <Icon name="ph:arrow-right" class="dashboard-card-header__arrow" />
      </NuxtLink>
      <template v-else>
        <Icon v-if="icon" :name="icon" class="dashboard-card-header__icon" />
        {{ title }}
      </template>
    </h2>
    <slot />
  </Flex>
</template>

<style scoped lang="scss">
.dashboard-card-header {
  margin-bottom: var(--space-m);
  min-height: 24px;
}

.dashboard-card-header__title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  font-size: var(--font-size-s);
  text-transform: uppercase;
  color: var(--color-text-light);
  margin: 0;
}

.dashboard-card-header__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.dashboard-card-header__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  color: inherit;

  &:hover,
  &:focus-visible {
    color: var(--color-text);

    .dashboard-card-header__arrow {
      opacity: 1;
      transform: none;
    }
  }
}

// Held back until the title is hovered, so a row of five cards isn't a row of
// five arrows competing with the badges.
.dashboard-card-header__arrow {
  font-size: 14px;
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--transition-duration) ease,
    transform var(--transition-duration) ease;
}
</style>
