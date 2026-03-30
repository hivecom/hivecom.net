<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, ButtonGroup, Card, Flex, Grid, Select, setColorTheme, Tooltip } from '@dolanske/vui'
import ThemeEditor from '@/components/Settings/ThemeEditor.vue'
import ThemeGallery from '@/components/Settings/ThemeGallery.vue'

// TODO THEMES
// 1. Theme editing
// 2. Theme deleting
// 3. Add default
// 4. Editor should start with the current theme (colors in sidebar dont work like that)
// 5. Change theme dropdown to Sheet instead. List all thems better - 2nd tab will

// Placeholder theme options for the planned Theme selector
// const { themes, loading: themesLoading } = useDataThemes()
const { activeTheme, setActiveTheme } = useUserTheme()
const { settings } = useDataUserSettings()

// Theme options & setting
const variantOptions = [
  // I spent _so_ damn long on the system theme and I couldn't get it working
  // properly. It just wouldn't update if system theme changed
  // { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const selectedVariant = computed({
  get() {
    const option = variantOptions.find(option => option.value === settings.value.theme)
    if (!option) {
      return []
    }
    return [option]
  },
  set(options) {
    if (options && options[0]) {
      const value = options[0].value as Tables<'settings'>['data']['theme']
      settings.value.theme = value
      setColorTheme(value)
    }
  },
})

const themeEditorOpen = ref(false)
</script>

<template>
  <div class="page">
    <section class="page-title">
      <h1>
        Theming
      </h1>
      <p>
        Discover community-made themes for Hivecom apps, or create your own!
      </p>
    </section>

    <!-- Theme settings -->
    <Card class="theme-settings-card">
      <!-- <strong class="text-color-lighter text-s block mb-m">
          Appearance
        </strong> -->
      <Grid columns="1fr 2px 1fr">
        <Flex class="p-m" x-between y-center gap="xxs" expand>
          <strong class="text-l">
            Current theme:
          </strong>
          <div class="flex-1" />
          <strong class="text-semibold text-color-accent mr-xs">{{ activeTheme?.name ?? 'Default' }}</strong>
          <ButtonGroup :gap="2">
            <Tooltip>
              <Button size="s" @click="themeEditorOpen = true">
                <template #start>
                  <Icon name="ph:pen" />
                </template>
                Personalize
              </Button>
              <template #tooltip>
                <p>Create a new theme based on the current one</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button size="s" square @click="setActiveTheme(null)">
                <Icon name="ph:arrow-clockwise" />
              </Button>
              <template #tooltip>
                <p>Switch back to default theme</p>
              </template>
            </Tooltip>
          </ButtonGroup>
        </Flex>
        <div class="divider" />

        <Flex class="p-m" x-between y-center expand>
          <strong class="text-l">
            Variant:
          </strong>
          <Select v-model="selectedVariant" :show-clear="false" :options="variantOptions" size="s" />
        </Flex>
      </Grid>
    </Card>

    <ThemeGallery @create="themeEditorOpen = true" />
  </div>

  <ThemeEditor :open="themeEditorOpen" @close="themeEditorOpen = false" />
</template>

<style lang="scss" scoped>
.theme-settings-card {
  background-color: var(--color-bg-card);
  margin-bottom: var(--space-xxl);

  :deep(.vui-card-content) {
    padding: 0;
  }
}

.divider {
  display: block;
  height: 100%;
  background-color: var(--color-border);
  width: 1px;
  /* margin-block: calc(var(--space-l) * -1); */
}
</style>
