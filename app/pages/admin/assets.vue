<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'

import AssetKPIs from '@/components/Admin/Assets/AssetKPIs.vue'
import AssetManager from '@/components/Admin/Assets/AssetManager.vue'

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
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0" expand>
      <h1>Assets</h1>
      <p class="text-color-light">
        Manage the media stored in the hivecom-cms bucket for use inside markdown content across the site.
      </p>
    </Flex>

    <AssetKPIs v-model:refresh-signal="refreshSignal" />

    <AssetManager
      v-model:refresh-signal="refreshSignal"
      :can-upload="canUpload"
      :can-delete="canDelete"
    />
  </Flex>
</template>
