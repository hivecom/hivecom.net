<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { Alert } from '@dolanske/vui'

import { computed, onBeforeMount, ref, useSlots, watch } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'
import { CMS_BUCKET_ID, formatBytes, getBucketLabel, isImageAsset, listStorageFilesRecursive, normalizePrefix } from '@/lib/storageAssets'

const props = withDefaults(defineProps<{
  bucketId?: StorageBucketId
}>(), {
  bucketId: CMS_BUCKET_ID,
})
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
const supabase = useSupabaseClient()
const bucketLabel = computed(() => getBucketLabel(props.bucketId))
const slots = useSlots()

const loading = ref(true)
const errorMessage = ref('')
const metrics = ref({
  total: 0,
  storage: 0,
  images: 0,
  folders: 0,
})

async function fetchMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    const files = await listStorageFilesRecursive(supabase, props.bucketId)
    const folderSet = new Set<string>()

    files.forEach((file) => {
      const folder = extractFolder(file.path)
      folderSet.add(folder)
    })

    metrics.value = {
      total: files.length,
      storage: files.reduce((sum, file) => sum + file.size, 0),
      images: files.filter(isImageAsset).length,
      folders: folderSet.size,
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

function extractFolder(path: string): string {
  const normalized = normalizePrefix(path)
  if (!normalized)
    return '/'
  const segments = normalized.split('/')
  segments.pop()
  return segments.length ? segments.join('/') : '/'
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
  <KPIContainer class="asset-kpi-row">
    <div v-if="slots.lead" class="kpi-lead">
      <slot name="lead" />
    </div>
    <KPICard
      label="Total Assets"
      :value="metrics.total"
      icon="ph:folders"
      variant="primary"
      :is-loading="loading"
      :description="`All files stored in the ${bucketLabel} bucket`"
    />

    <KPICard
      label="Storage Used"
      :value="formatBytes(metrics.storage)"
      icon="ph:database"
      variant="success"
      :is-loading="loading"
      :description="`Approximate total size of all ${bucketLabel} assets`"
    />

    <KPICard
      label="Image Assets"
      :value="metrics.images"
      icon="ph:image"
      variant="warning"
      :is-loading="loading"
      :description="`Images available for markdown embeds in the ${bucketLabel} bucket`"
    />
  </KPIContainer>

  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>
</template>

<style scoped lang="scss">
.asset-kpi-row {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-m);
  align-items: stretch;
}

.asset-kpi-row :deep(> .kpi-card),
.asset-kpi-row > .kpi-lead {
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
