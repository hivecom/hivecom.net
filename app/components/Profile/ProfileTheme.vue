<script setup lang="ts">
import { Card, Flex, Tooltip } from '@dolanske/vui'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import { DEFAULT_THEME } from '@/lib/theme'

const props = defineProps<{
  themeId?: string | null
}>()

const { getById } = useDataThemes()
const { setActiveTheme } = useUserTheme()

const activeTheme = computed(() => props.themeId ? getById(props.themeId) : DEFAULT_THEME)
</script>

<template>
  <Card class="card-bg">
    <Flex expand y-center x-between gap="s">
      <div>
        <span class="activity-item__label">
          Theme
        </span>
        <strong class="activity-item__title no-padding">
          {{ activeTheme ? activeTheme.name : 'Hivecom Theme' }}
        </strong>
      </div>
      <Tooltip>
        <button @click="setActiveTheme(props.themeId ?? null)">
          <ThemeIcon v-if="activeTheme" :theme="activeTheme" size="m" />
        </button>
        <template #tooltip>
          <p>Use theme</p>
        </template>
      </Tooltip>
    </Flex>
  </Card>
</template>

<style scoped lang="scss">
.no-padding {
  padding-left: 0 !important;
}
</style>
