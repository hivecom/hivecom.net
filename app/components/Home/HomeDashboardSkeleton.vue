<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'

// Placeholder for a dashboard card section while its data is still cold.
// Mirrors the geometry of the real items so the card doesn't jump when the
// content lands: `grid` matches `.home-item-list`, `cover` matches the same
// grid filled with artwork cards, `rows` matches the stacked
// `.home-item.inline` lists, `card` matches a stack of compact cards with a
// title, a line of body and a badge row, `block` matches a single full-width
// item, `strip` matches the 72px activity histogram.
withDefaults(defineProps<{
  variant?: 'grid' | 'cover' | 'rows' | 'card' | 'block' | 'strip'
  /** How many placeholder items to draw. Ignored by `block` and `strip`. */
  count?: number
  /** Draw the section label bar above the items. */
  label?: boolean
  /** Lead each row with a square, for lists whose items carry an icon. */
  icon?: boolean
}>(), {
  variant: 'grid',
  count: 4,
  label: true,
  icon: false,
})
</script>

<template>
  <div class="dashboard-skeleton">
    <Skeleton v-if="label" class="dashboard-skeleton__label" :height="12" :width="90" :radius="4" />

    <div v-if="variant === 'grid'" class="home-item-list">
      <div v-for="i in count" :key="i" class="home-item">
        <Skeleton :height="16" :width="`${60 + ((i * 17) % 35)}%`" :radius="4" />
        <Skeleton :height="10" :width="`${35 + ((i * 11) % 25)}%`" :radius="4" />
      </div>
    </div>

    <div v-else-if="variant === 'cover'" class="home-item-list">
      <Skeleton v-for="i in count" :key="i" :height="108" width="100%" :radius="8" />
    </div>

    <Flex v-else-if="variant === 'rows'" column gap="xs">
      <div v-for="i in count" :key="i" class="home-item inline dashboard-skeleton__row">
        <Flex y-center gap="s" class="dashboard-skeleton__lead">
          <Skeleton v-if="icon" :height="24" :width="24" :radius="6" />
          <Skeleton :height="16" :width="`${120 + ((i * 37) % 90)}px`" :radius="4" />
        </Flex>
        <Skeleton :height="12" :width="60" :radius="4" />
      </div>
    </Flex>

    <Flex v-else-if="variant === 'card'" column gap="xs">
      <div v-for="i in count" :key="i" class="home-item dashboard-skeleton__card">
        <Skeleton :height="18" :width="`${55 + ((i * 19) % 30)}%`" :radius="4" />
        <Skeleton :height="12" :width="`${70 + ((i * 13) % 25)}%`" :radius="4" />
        <Flex gap="xs">
          <Skeleton :height="18" :width="72" :radius="999" />
          <Skeleton :height="18" :width="92" :radius="999" />
        </Flex>
      </div>
    </Flex>

    <Skeleton v-else-if="variant === 'strip'" :height="72" width="100%" :radius="8" />

    <div v-else class="home-item">
      <Skeleton :height="16" width="70%" :radius="4" />
      <Skeleton :height="10" width="40%" :radius="4" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-skeleton {
  width: 100%;

  &:not(:last-child) {
    margin-bottom: var(--space-m);
  }
}

.dashboard-skeleton__label {
  margin-bottom: var(--space-xs);
}

// The placeholder is inert, so it shouldn't pick up the item hover treatment.
.home-item {
  pointer-events: none;
  justify-content: center;
}

// Rows mirror a real item, which is icon-then-name on the left against a short
// value on the right, so they shouldn't centre their contents like the rest.
.dashboard-skeleton__row {
  justify-content: space-between;
  align-items: center;
}

.dashboard-skeleton__lead {
  min-width: 0;
}

// Roughly a compact ReferendumCard: title, a line of body, then its badges.
.dashboard-skeleton__card {
  justify-content: flex-start;
  gap: var(--space-s);
  padding: var(--space-s);
}
</style>
