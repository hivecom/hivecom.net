<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { Button, Flex, pushToast, Tab, Tabs } from '@dolanske/vui'

import { computed, ref, watch } from 'vue'
import AssetKPIs from '@/components/Admin/Assets/AssetKPIs.vue'
import AssetManager from '@/components/Admin/Assets/AssetManager.vue'
import AssetUpload from '@/components/Admin/Assets/AssetUpload.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { CMS_BUCKET_ID, getBucketDescription, getBucketLabel, getBucketOptions, STORAGE_BUCKET_IDS } from '@/lib/storageAssets'

definePageMeta({ layout: 'admin' })

const { canCreateAssets, canViewAssets } = useAdminPermissions()

if (!canViewAssets.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view assets',
  })
}

const route = useRoute()
const router = useRouter()
const runtimeConfig = useRuntimeConfig()

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
const showUploadDrawer = ref(false)

const { settings } = useDataUserSettings()
const viewMode = ref<'table' | 'grid'>(route.query.view !== undefined ? parseView(route.query.view) : (settings.value.admin_asset_view_mode ?? 'table'))
const flatView = ref(route.query.flat !== undefined ? route.query.flat === '1' : settings.value.admin_asset_flat_view)
const currentPrefix = ref(typeof route.query.path === 'string' ? route.query.path : '')
const page = ref(parsePage(route.query.page))
const canUpload = computed(() => canCreateAssets.value)
const storageConsoleUrl = computed(() => {
  const projectRef = runtimeConfig.public?.supabaseProjectRef
  if (typeof projectRef !== 'string' || projectRef.length === 0)
    return ''
  return `https://supabase.com/dashboard/project/${projectRef}/storage/buckets/${activeTab.value}`
})

watch(viewMode, (val) => {
  settings.value.admin_asset_view_mode = val
})
watch(flatView, (val) => {
  settings.value.admin_asset_flat_view = val
})

const bucketOptions = getBucketOptions()
const bucketLabel = computed(() => getBucketLabel(activeTab.value))
const bucketDescription = computed(() => getBucketDescription(activeTab.value))

function handleUploadSuccess(paths: string[]) {
  if (paths.length)
    pushToast(`${paths.length} file${paths.length > 1 ? 's' : ''} uploaded`)
  refreshSignal.value++
}

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

      <template #end>
        <Flex gap="xs" wrap>
          <Button v-if="canUpload" variant="accent" size="s" @click="showUploadDrawer = true">
            <template #start>
              <Icon name="ph:upload" />
            </template>
            Upload
          </Button>

          <Button
            v-if="storageConsoleUrl"
            size="s"
            variant="gray"
            :href="storageConsoleUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Supabase
            <template #end>
              <Icon name="ph:arrow-square-out" />
            </template>
          </Button>
        </Flex>
      </template>
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

    <AssetUpload
      v-model:is-open="showUploadDrawer"
      :can-upload="canUpload"
      :current-prefix="currentPrefix"
      :bucket-id="activeTab"
      @uploaded="handleUploadSuccess"
    />
  </Flex>
</template>
