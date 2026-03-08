<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Card, Divider, Flex, Select, setColorTheme, Switch } from '@dolanske/vui'

const { settings, settingsError } = useUserSettings()

// Theme options & setting
const themeOptions = [
  // I spent _so_ damn long on this and I couldn't get the system theme working
  // properly. It just wouldn't update if system theme changed

  // { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const selectedTheme = computed({
  get() {
    const option = themeOptions.find(option => option.value === settings.value.theme)
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

    <Flex x-between y-center class="mb-s">
      <p>Color theme</p>
      <Select v-model="selectedTheme" class="settings-select" :show-clear="false" :options="themeOptions" size="s" />
    </Flex>
    <Switch disabled class="reversed">
      <Flex y-center gap="xxs">
        <p>High contrast colors</p>
        <SharedTinyBadge>
          Planned
        </SharedTinyBadge>
      </Flex>
    </Switch>

    <Divider :size="64" />

    <strong class="text-color-lighter text-s block mb-m">
      Discussions
    </strong>
    <Switch v-model="settings.show_nsfw_content" class="reversed mb-m" label="Show NSFW content" />
    <Switch v-model="settings.show_nsfw_warning" class="reversed" label="Show NSFW content warnings" :disabled="!settings.show_nsfw_content" hint="You will be warned before viewing content marked as NSFW each time." />

    <Divider :size="64" />

    <strong class="text-color-lighter text-s block mb-m">
      Forum
    </strong>

    <Switch v-model="settings.show_forum_updates" class="reversed mb-m" label="Show latest updates" />
    <Switch v-model="settings.show_forum_recently_visited" class="reversed mb-m" label="Show recently visited" />
    <Switch v-model="settings.show_forum_archived" class="reversed mb-m" label="Show archived topics & discussions" />

    <Switch v-model="settings.editor_floating" class="reversed" disabled hint="If enabled, the text editor will stay at the bottom of the screen while scrolling through large forum posts.">
      <Flex y-center ga="xxs">
        <p>Floating text editor</p>
        <!-- <SharedTinyBadge variant="info">
          Beta
        </SharedTinyBadge> -->
        <SharedTinyBadge>
          Planned
        </SharedTinyBadge>
      </Flex>
    </Switch>
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
