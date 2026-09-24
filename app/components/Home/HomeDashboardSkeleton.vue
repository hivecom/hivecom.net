<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'

// Mirrors the real items' geometry so the card doesn't jump when content lands.
// `strip` matches the 72px hourly activity histogram bar for bar.
withDefaults(defineProps<{
  variant?: 'grid' | 'cover' | 'rows' | 'card' | 'block' | 'strip'
  /** Ignored by `block` and `strip` */
  count?: number
  label?: boolean
  /** Leads each row with a square, for items with an icon */
  icon?: boolean
  /** Room for a small button, which sets the real row's height */
  action?: boolean
}>(), {
  variant: 'grid',
  count: 4,
  label: true,
  icon: false,
  action: false,
})
</script>

<template>
  <div class="dashboard-skeleton">
    <div v-if="label" class="dashboard-skeleton__head">
      <Skeleton :height="12" :width="90" :radius="4" />
    </div>

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
        <div class="dashboard-skeleton__tail" :class="{ 'dashboard-skeleton__tail--action': action }">
          <Skeleton :height="12" :width="60" :radius="4" />
        </div>
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

    <ChartActivityHistogram v-else-if="variant === 'strip'" loading :count="24" :height="72" gap="xxs" expand compact />

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

// Same box as .dashboard-section__head, or every section below drifts up 8px
.dashboard-skeleton__head {
  display: flex;
  align-items: center;
  min-height: 20px;
  margin-bottom: var(--space-xs);
}

.home-item {
  pointer-events: none;
  justify-content: center;
}

.dashboard-skeleton__row {
  justify-content: space-between;
  align-items: center;
}

.dashboard-skeleton__lead {
  min-width: 0;
}

.dashboard-skeleton__tail {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

// The real row's height comes from its size-s button
.dashboard-skeleton__tail--action {
  height: var(--interactive-el-height-s);
}

// Roughly a compact ReferendumCard
.dashboard-skeleton__card {
  justify-content: flex-start;
  gap: var(--space-s);
  padding: var(--space-s);
}
</style>
