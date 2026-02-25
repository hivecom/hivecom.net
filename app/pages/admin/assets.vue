<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { Card, Flex, Select } from '@dolanske/vui'

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

interface SelectOption<T extends string = string> {
  label: string
  value: T
}

const refreshSignal = ref(0)
const canUpload = computed(() => canCreateAssets.value)
const canDelete = computed(() => canDeleteAssets.value)

const bucketOptions = getBucketOptions()
const selectedBucket = ref<SelectOption<StorageBucketId>[]>([bucketOptions[0] ?? { label: getBucketLabel(CMS_BUCKET_ID), value: CMS_BUCKET_ID }])
const bucketId = computed(() => selectedBucket.value[0]?.value ?? CMS_BUCKET_ID)
const bucketLabel = computed(() => getBucketLabel(bucketId.value))
const bucketDescription = computed(() => getBucketDescription(bucketId.value))
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0" expand>
      <h1>Assets</h1>
      <p class="text-color-light">
        Manage media stored in the {{ bucketLabel }} bucket for use across the site.
      </p>
    </Flex>

    <AssetKPIs v-model:refresh-signal="refreshSignal" :bucket-id="bucketId">
      <template #lead>
        <Card class="card-bg" separators expand>
          <Flex column gap="xs" expand>
            <Select
              v-model="selectedBucket"
              expand
              :options="bucketOptions"
              label="Bucket"
              single
            />
            <p v-if="bucketDescription" class="text-color-light text-xs">
              {{ bucketDescription }}
            </p>
          </Flex>
        </Card>
      </template>
    </AssetKPIs>

    <AssetManager
      v-model:refresh-signal="refreshSignal"
      :can-upload="canUpload"
      :can-delete="canDelete"
      :bucket-id="bucketId"
    />
  </Flex>
</template>
