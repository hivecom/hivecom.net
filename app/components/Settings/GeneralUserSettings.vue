<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, ButtonGroup, Card, Divider, Dropdown, Flex, Select, setColorTheme, Switch, Tooltip } from '@dolanske/vui'
import ThemeDropdownItem from './ThemeDropdownItem.vue'
import ThemeEditor from './ThemeEditor.vue'

// TODO THEMES
// 1. Theme editing
// 2. Theme deleting
// 3. ADd default
// 4. Editor should start with the current theme (colors in sidebar dont work like that)

// Placeholder theme options for the planned Theme selector
const { themes, loading: themesLoading } = useDataThemes()
const { activeTheme, setActiveTheme } = useUserTheme()

const { settings, settingsError } = useDataUserSettings()

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

const themeOptions = computed(() => [
  { name: 'Default theme', created_by: 'Hivecom', id: null },
  ...themes.value,
])

const themeEditorOpen = ref(false)
</script>

<template>
  <Card v-if="!settingsError" class="card-bg" separators>
    <template #header>
      <h4>
        General
      </h4>
    </template>

    <strong class="text-color-lighter text-s block mb-m">
      Appearance
    </strong>

    <ThemeEditor :open="themeEditorOpen" @close="themeEditorOpen = false" />

    <Flex x-between y-center class="mb-s" gap="xxs">
      <p>Theme</p>
      <div class="flex-1" />
      <Tooltip>
        <Button size="s" square outline @click="themeEditorOpen = true">
          <Icon name="solar:gallery-edit-linear" />
        </Button>
        <template #tooltip>
          <p>Create a new theme</p>
        </template>
      </Tooltip>
      <Dropdown>
        <template #trigger="{ toggle }">
          <Button outline size="s" :loading="themesLoading" @click="toggle">
            {{ activeTheme === null ? 'Default theme' : activeTheme.name }}
            <template #end>
              <Icon name="ph:caret-down" />
            </template>
          </Button>
        </template>
        <ThemeDropdownItem v-for="item in themeOptions" :key="item.id ?? item.name" :data="item" :is-active="item.id === activeTheme?.id" @click="setActiveTheme(item.id)" />
      </Dropdown>
    </Flex>
    <Flex x-between y-center class="mb-s">
      <p>Theme variant</p>
      <Select v-model="selectedVariant" :show-clear="false" :options="variantOptions" size="s" />
    </Flex>

    <Divider :size="64" />

    <strong class="text-color-lighter text-s block mb-m">
      Discussions
    </strong>
    <Switch v-model="settings.show_nsfw_content" class="reversed mb-m" label="Show NSFW content" />
    <Switch v-model="settings.show_nsfw_warning" class="reversed mb-m" label="Show NSFW content warnings" :disabled="!settings.show_nsfw_content" hint="You will be warned before viewing content marked as NSFW each time." />
    <Switch v-model="settings.show_offtopic_replies" class="reversed mb-m" label="Show off-topic replies by default" hint="When enabled, replies marked as off-topic by the discussion author will be visible (but dimmed) by default." />

    <Flex x-between y-center class="mb-m">
      <p>Default reply view</p>
      <ButtonGroup size="s">
        <Button
          :variant="settings.discussion_view_mode === 'flat' ? 'accent' : 'gray'"
          size="s"
          @click="settings.discussion_view_mode = 'flat'"
        >
          Flat
        </Button>
        <Button
          :variant="settings.discussion_view_mode === 'threaded' ? 'accent' : 'gray'"
          size="s"
          @click="settings.discussion_view_mode = 'threaded'"
        >
          Threaded
        </Button>
      </ButtonGroup>
    </Flex>

    <Switch
      v-model="settings.show_thread_replies"
      class="reversed"
      label="Expand reply threads by default"
      hint="When enabled, inline reply previews will be expanded automatically on each post."
      :disabled="settings.discussion_view_mode === 'threaded'"
    />

    <Divider :size="64" />

    <strong class="text-color-lighter text-s block mb-m">
      Forum
    </strong>

    <Switch v-model="settings.show_forum_updates" class="reversed mb-m" label="Show latest updates" />
    <Switch v-model="settings.show_forum_recently_visited" class="reversed mb-m" label="Show recently visited" />
    <Switch v-model="settings.show_forum_archived" class="reversed" label="Show archived topics & discussions" />

    <Divider :size="64" />

    <strong class="text-color-lighter text-s block mb-m">
      Rich Text Editor
    </strong>

    <Switch v-model="settings.editor_floating" class="reversed mb-m" label="Floating text editor" hint="If enabled, the text editor will stay at the bottom of the screen while scrolling through large forum posts." />
    <Switch v-model="settings.strip_image_metadata" class="reversed" label="Strip image metadata on upload" hint="Removes EXIF and other embedded metadata from images before uploading. Disable if you need to preserve location, camera, or other metadata." />
  </Card>
</template>

<style lang="scss" scoped>
:deep(.vui-switch) {
  &.disabled {
    filter: grayscale(100%) opacity(0.6);

    & + p {
      filter: grayscale(100%) opacity(0.4);
    }
  }
}
</style>
