<script setup lang="ts">
import { Alert } from '@dolanske/vui'
import { onBeforeMount, ref, watch } from 'vue'

import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'
import { formatBytes, isImageAsset, listCmsFilesRecursive, normalizePrefix } from '@/lib/utils/cmsAssets'

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
const supabase = useSupabaseClient()

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
    const files = await listCmsFilesRecursive(supabase)
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

onBeforeMount(fetchMetrics)
</script>

<template>
  <KPIContainer>
    <KPICard
      label="Total Assets"
      :value="metrics.total"
      icon="ph:folders"
      variant="primary"
      :is-loading="loading"
      description="All files stored in the CMS bucket"
    />

    <KPICard
      label="Storage Used"
      :value="formatBytes(metrics.storage)"
      icon="ph:database"
      variant="success"
      :is-loading="loading"
      description="Approximate total size of all CMS assets"
    />

    <KPICard
      label="Image Assets"
      :value="metrics.images"
      icon="ph:image"
      variant="warning"
      :is-loading="loading"
      description="Images available for markdown embeds"
    />
  </KPIContainer>

  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>
</template>
