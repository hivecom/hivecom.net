<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { computed, onBeforeMount, ref, watch } from 'vue'
import StorageKPIRow from '@/components/Admin/Shared/StorageKPIRow.vue'
import { CMS_BUCKET_ID, getBucketLabel } from '@/lib/storageAssets'

const props = withDefaults(defineProps<{
  bucketId?: StorageBucketId
}>(), {
  bucketId: CMS_BUCKET_ID,
})
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
const supabase = useSupabaseClient()
const bucketLabel = computed(() => getBucketLabel(props.bucketId))

const loading = ref(true)
const errorMessage = ref('')
const metrics = ref({
  total: 0,
  storage: 0,
  images: 0,
})

async function fetchMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.rpc('get_storage_bucket_metrics', {
      p_bucket_id: props.bucketId,
    })

    if (error)
      throw error

    const row = data?.[0]
    metrics.value = {
      total: row?.total_files ?? 0,
      storage: row?.total_size ?? 0,
      images: row?.total_images ?? 0,
    }
  }
  catch (error: unknown) {
    console.error('Failed to load asset metrics', error)
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load asset metrics'
  }
  finally {
    loading.value = false
  }
}

watch(() => refreshSignal.value, () => {
  fetchMetrics()
})

watch(() => props.bucketId, () => {
  fetchMetrics()
})

onBeforeMount(fetchMetrics)
</script>

<template>
  <StorageKPIRow
    :total="metrics.total"
    :storage="metrics.storage"
    :images="metrics.images"
    :loading="loading"
    :error-message="errorMessage"
    total-label="Total Assets"
    :total-description="`All files stored in the ${bucketLabel} bucket`"
    :storage-description="`Approximate total size of all ${bucketLabel} assets`"
    images-label="Image Assets"
    :images-description="`Images available for markdown embeds in the ${bucketLabel} bucket`"
  >
    <template v-if="$slots.lead" #lead>
      <slot name="lead" />
    </template>
  </StorageKPIRow>
</template>
