<script setup lang="ts">
import { Card, Flex, Tooltip } from '@dolanske/vui'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import { DEFAULT_THEME } from '@/lib/theme'

const props = defineProps<{
  themeId?: string | null
}>()

const { getById } = useDataThemes()
const { previewTheme } = useThemePreview()
const { activeTheme } = useUserTheme()

const activeThemeData = computed(() => props.themeId ? getById(props.themeId) : DEFAULT_THEME)
const isAlreadyActive = computed(() => props.themeId != null && activeTheme.value?.id === props.themeId)
</script>

<template>
  <Card class="card-bg">
    <Flex expand y-center x-between gap="s">
      <div>
        <span class="activity-item__label">
          Theme
        </span>
        <strong class="activity-item__title no-padding">
          {{ activeThemeData ? activeThemeData.name : 'Hivecom Theme' }}
        </strong>
      </div>
      <Flex y-center gap="xs">
        <Tooltip v-if="props.themeId && activeThemeData && !isAlreadyActive">
          <button
            class="preview-btn" @click="(e: MouseEvent) => previewTheme(activeThemeData!, { x: e.clientX,
                                                                                            y: e.clientY })"
          >
            <Icon name="ph:flask" :size="16" />
          </button>
          <template #tooltip>
            <p>Preview theme</p>
          </template>
        </Tooltip>
        <Tooltip v-if="activeThemeData">
          <NuxtLink v-if="props.themeId" :to="`/themes/${props.themeId}`">
            <ThemeIcon :theme="activeThemeData" size="m" />
          </NuxtLink>
          <ThemeIcon v-else :theme="activeThemeData" size="m" />
          <template #tooltip>
            <p>{{ props.themeId ? 'View Theme' : activeThemeData.name }}</p>
          </template>
        </Tooltip>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped lang="scss">
.no-padding {
  padding-left: 0 !important;
}

.preview-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--interactive-el-height);
  height: var(--interactive-el-height);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  background: var(--color-bg-raised);
  color: var(--color-text-light);
  cursor: pointer;
  transition:
    color var(--transition),
    background var(--transition),
    border-color var(--transition);

  &:hover {
    color: var(--color-text);
    background: var(--color-bg-medium);
    border-color: var(--color-border-strong);
  }
}
</style>
