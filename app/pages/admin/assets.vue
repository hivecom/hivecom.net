<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { Flex, Tab, Tabs } from '@dolanske/vui'

import { computed, ref, watch } from 'vue'
import AssetKPIs from '@/components/Admin/Assets/AssetKPIs.vue'
import AssetManager from '@/components/Admin/Assets/AssetManager.vue'
import { CMS_BUCKET_ID, getBucketDescription, getBucketLabel, getBucketOptions, STORAGE_BUCKET_IDS } from '@/lib/storageAssets'

const { canViewAssets } = useAdminPermissions()

if (!canViewAssets.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view assets',
  })
}

const route = useRoute()
const router = useRouter()

function parseTab(val: unknown): StorageBucketId {
  if (typeof val === 'string' && (STORAGE_BUCKET_IDS as readonly string[]).includes(val))
    return val as StorageBucketId
  return CMS_BUCKET_ID
}

function parseView(val: unknown): 'table' | 'grid' {
  return val === 'grid' ? 'grid' : 'table'
}

function parsePage(val: unknown): number {
  const n = Number(val)
  return Number.isInteger(n) && n > 0 ? n : 1
}

const refreshSignal = ref(0)
const activeTab = ref<StorageBucketId>(parseTab(route.query.tab))
const viewMode = ref<'table' | 'grid'>(parseView(route.query.view))
const flatView = ref(route.query.flat === '1')
const currentPrefix = ref(typeof route.query.path === 'string' ? route.query.path : '')
const page = ref(parsePage(route.query.page))

const bucketOptions = getBucketOptions()
const bucketLabel = computed(() => getBucketLabel(activeTab.value))
const bucketDescription = computed(() => getBucketDescription(activeTab.value))

watch([activeTab, viewMode, flatView, currentPrefix, page], ([tab, view, flat, path, pg]) => {
  void router.replace({
    query: {
      tab,
      view,
      flat: flat ? '1' : undefined,
      path: path || undefined,
      page: pg > 1 ? String(pg) : undefined,
    },
  })
})
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0" expand>
      <h1>Assets</h1>
      <p class="text-color-light">
        Manage media stored in the {{ bucketLabel }} bucket for use across the site.
        <template v-if="bucketDescription">
          {{ bucketDescription }}.
        </template>
      </p>
    </Flex>

    <Tabs v-model="activeTab">
      <Tab v-for="bucket in bucketOptions" :key="bucket.value" :value="bucket.value">
        {{ bucket.label }}
      </Tab>
    </Tabs>

    <AssetKPIs v-model:refresh-signal="refreshSignal" :bucket-id="activeTab" />

    <AssetManager
      v-model:refresh-signal="refreshSignal"
      v-model:view-mode="viewMode"
      v-model:flat-view="flatView"
      v-model:current-prefix="currentPrefix"
      v-model:page="page"
      :bucket-id="activeTab"
    />
  </Flex>
</template>
