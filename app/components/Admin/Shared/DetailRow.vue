<script setup lang="ts">
import { Grid } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  /**
   * The label text displayed in the left column.
   */
  label: string
  /**
   * Column layout. Use "wide" for a 1fr/2fr split (label narrower, value wider).
   * Use "equal" for a 50/50 split. Defaults to "wide".
   */
  split?: 'wide' | 'equal'
  /**
   * When true, the row is not rendered. Useful for conditionally hiding rows
   * without wrapping every row in a v-if at the call site.
   */
  hidden?: boolean
  /**
   * Allow the row to wrap onto multiple lines (passes `wrap` to the Grid).
   */
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
  height: calc(var(--interactive-el-height) + var(--space-s) * 2);
  align-items: center;
  padding: 0 var(--space-m);

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
