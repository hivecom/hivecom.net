<script setup lang="ts">
import { onBeforeMount, ref, watch } from 'vue'
import StorageKPIRow from '@/components/Admin/Shared/StorageKPIRow.vue'
import { useDepot } from '@/composables/useDepot'

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
  <StorageKPIRow
    :total="metrics.total_files"
    :storage="metrics.total_size"
    :images="metrics.total_images"
    :loading="loading"
    :error-message="errorMessage"
    total-label="Total Uploads"
    total-description="All uploads recorded on the gateway"
    storage-description="Approximate total. Counts uploads recorded at presign, so pending ones inflate it until reconciliation prunes them."
    images-label="Image Uploads"
    images-description="Uploads with an image content type"
  />
</template>
