<script setup lang="ts">
import { Grid } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  label: string

  /** "wide" is a 1fr/2fr split, "equal" is 50/50. Defaults to "wide". */
  split?: 'wide' | 'equal'

  /** Skips rendering, so call sites don't need a v-if on every row. */
  hidden?: boolean

  /** Passes `wrap` to the Grid. */
  wrap?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  split: 'wide',
  hidden: false,
  wrap: false,
})

const columns = computed(() => props.split === 'equal' ? 2 : '1fr 2fr')
</script>

<template>
  <Grid
    v-if="!hidden"
    class="detail-row"
    expand
    :columns="columns"
    :wrap="wrap || undefined"
  >
    <span class="detail-row__label">{{ label }}</span>
    <div class="detail-row__value">
      <slot />
    </div>
  </Grid>
</template>

<style scoped lang="scss">
.detail-row {
  min-height: calc(var(--interactive-el-height) * 1.5);
  align-items: center;
  padding-inline: var(--space-m);
  padding-block: var(--space-xs);

  &__label {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
  }

  &__value {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
    min-width: 0; // prevent overflow in narrow containers
  }
}
</style>
