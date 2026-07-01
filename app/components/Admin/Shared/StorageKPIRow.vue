<script setup lang="ts">
import { Alert } from '@dolanske/vui'
import { useSlots } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'
import { formatBytes } from '@/lib/storageAssets'

// Presentational KPI row shared by the Assets and Depot pages. Both surface the
// same three metrics (count, storage, images) with the same icons and variants;
// only the copy and the data source differ, so callers pass values and labels
// and keep their own fetching.
withDefaults(defineProps<{
  total: number
  storage: number
  images: number
  loading?: boolean
  errorMessage?: string
  totalLabel: string
  totalDescription: string
  storageDescription: string
  imagesLabel: string
  imagesDescription: string
  storageLabel?: string
}>(), {
  loading: false,
  errorMessage: '',
  storageLabel: 'Storage Used',
})

const slots = useSlots()
</script>

<template>
  <KPIContainer class="storage-kpi-row">
    <div v-if="slots.lead" class="kpi-lead">
      <slot name="lead" />
    </div>

    <KPICard
      :label="totalLabel"
      :value="total"
      icon="ph:folders"
      variant="primary"
      :is-loading="loading"
      :description="totalDescription"
    />

    <KPICard
      :label="storageLabel"
      :value="formatBytes(storage)"
      icon="ph:database"
      variant="success"
      :is-loading="loading"
      :description="storageDescription"
    />

    <KPICard
      :label="imagesLabel"
      :value="images"
      icon="ph:image"
      variant="warning"
      :is-loading="loading"
      :description="imagesDescription"
    />
  </KPIContainer>

  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>
</template>

<style scoped lang="scss">
.storage-kpi-row {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-m);
  align-items: stretch;
}

.storage-kpi-row :deep(> .kpi-card),
.storage-kpi-row > .kpi-lead {
  width: 100%;
  height: 100%;
}

.kpi-lead {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.kpi-lead :deep(.card-bg) {
  height: 100%;
  width: 100%;
  display: flex;
}

.kpi-lead :deep(.card-bg > .flex) {
  flex: 1 1 auto;
}
</style>
