<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { Flex, Tab, Tabs } from '@dolanske/vui'

import { computed, ref } from 'vue'
import AssetKPIs from '@/components/Admin/Assets/AssetKPIs.vue'
import AssetManager from '@/components/Admin/Assets/AssetManager.vue'
import { CMS_BUCKET_ID, getBucketDescription, getBucketLabel, getBucketOptions } from '@/lib/storageAssets'

const {
  canViewAssets,
  canCreateAssets,
  canDeleteAssets,
} = useAdminPermissions()

if (!canViewAssets.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view assets',
  })
}

const refreshSignal = ref(0)
const canUpload = computed(() => canCreateAssets.value)
const canDelete = computed(() => canDeleteAssets.value)

const bucketOptions = getBucketOptions()
const activeTab = ref<StorageBucketId>(CMS_BUCKET_ID)
const bucketLabel = computed(() => getBucketLabel(activeTab.value))
const bucketDescription = computed(() => getBucketDescription(activeTab.value))
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
      :can-upload="canUpload"
      :can-delete="canDelete"
      :bucket-id="activeTab"
    />
  </Flex>
</template>
