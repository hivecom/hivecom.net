<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import ThemeTable from '@/components/Admin/Themes/ThemeTable.vue'

const { hasPermission } = useAdminPermissions()

const canViewThemes = computed(() =>
  hasPermission('themes.read'),
)

if (!canViewThemes.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view themes',
  })
}

const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0">
      <h1>Themes</h1>
      <p class="text-color-light">
        Browse and manage community themes.
      </p>
    </Flex>

    <ThemeTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
