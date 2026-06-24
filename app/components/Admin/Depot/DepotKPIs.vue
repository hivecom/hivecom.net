<script setup lang="ts">
import { Alert } from '@dolanske/vui'
import { onBeforeMount, ref, watch } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'
import { useDepot } from '@/composables/useDepot'
import { formatBytes } from '@/lib/storageAssets'

// Bumped by the table after a delete so the cards refetch.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { adminMetrics } = useDepot()

const loading = ref(true)
const errorMessage = ref('')
const metrics = ref({ total_files: 0, total_size: 0, total_images: 0 })

async function fetchMetrics() {
  loading.value = true
  errorMessage.value = ''
  try {
    metrics.value = await adminMetrics()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load depot metrics'
  }
  finally {
    loading.value = false
  }
}

watch(() => refreshSignal.value, fetchMetrics)
onBeforeMount(fetchMetrics)
</script>

<template>
  <KPIContainer class="depot-kpi-row">
    <KPICard
      label="Total Uploads"
      :value="metrics.total_files"
      icon="ph:folders"
      variant="primary"
      :is-loading="loading"
      description="All uploads recorded on the gateway"
    />
    <KPICard
      label="Storage Used"
      :value="formatBytes(metrics.total_size)"
      icon="ph:database"
      variant="success"
      :is-loading="loading"
      description="Approximate total. Counts uploads recorded at presign, so pending ones inflate it until reconciliation prunes them."
    />
    <KPICard
      label="Image Uploads"
      :value="metrics.total_images"
      icon="ph:image"
      variant="warning"
      :is-loading="loading"
      description="Uploads with an image content type"
    />
  </KPIContainer>

  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>
</template>

<style scoped lang="scss">
.depot-kpi-row {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-m);
  align-items: stretch;
}

.depot-kpi-row :deep(> .kpi-card) {
  width: 100%;
  height: 100%;
}
</style>
