<script setup lang="ts">
import { Button, ButtonGroup, Card, Divider, Flex, Select, Switch } from '@dolanske/vui'

const { settings, settingsError } = useDataUserSettings()
const { setActiveTheme, themeOptions, selectedTheme, setVariant, selectedVariant, variantOptions } = useUserTheme()
const { transitionTheme } = useThemeTransition()

let themePendingOrigin: { x: number, y: number } | undefined
let variantPendingOrigin: { x: number, y: number } | undefined

const selectedThemeWithTransition = computed({
  get() {
    return selectedTheme.value
  },
  set(value: typeof selectedTheme.value) {
    const origin = themePendingOrigin
    themePendingOrigin = undefined
    if (value[0] !== undefined)
      void setActiveTheme(value[0].value, origin)
  },
})

const selectedVariantWithTransition = computed({
  get() {
    return selectedVariant.value
  },
  set(value: typeof selectedVariant.value) {
    const origin = variantPendingOrigin
    variantPendingOrigin = undefined
    if (value[0])
      void transitionTheme(() => setVariant(value[0]!.value), origin)
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
    <Flex class="mb-m" x-between y-center>
      <p>Current theme</p>
      <div
        @click.capture="(e: MouseEvent) => themePendingOrigin = { x: e.clientX,
                                                                  y: e.clientY }"
      >
        <Select v-model="selectedThemeWithTransition" search :show-clear="false" :options="themeOptions" size="s" searchable />
      </div>
    </Flex>
    <Flex x-between y-center class="mb-m">
      <p>Variant</p>
      <div
        @click.capture="(e: MouseEvent) => variantPendingOrigin = { x: e.clientX,
                                                                    y: e.clientY }"
      >
        <Select v-model="selectedVariantWithTransition" :show-clear="false" :options="variantOptions" size="s" />
      </div>
    </Flex>
    <Switch v-model="settings.allow_custom_css" class="reversed" label="Allow custom CSS from themes" hint="When enabled, themes that include custom CSS will apply it. Only enable this if you trust the theme author." />

    <Divider class="my-l" />

    <strong class="text-color-lighter text-s block mb-m">
      Discussions
    </strong>
    <Switch v-model="settings.show_nsfw_content" class="reversed mb-m" label="Show NSFW content" />
    <Switch v-model="settings.show_nsfw_warning" class="reversed mb-m" label="Show NSFW content warnings" :disabled="!settings.show_nsfw_content" hint="You will be warned before viewing content marked as NSFW each time." />
    <Switch v-model="settings.show_offtopic_replies" class="reversed mb-m" label="Show off-topic replies by default" hint="When enabled, replies marked as off-topic by the discussion author will be visible (but dimmed) by default." />
    <Switch v-model="settings.show_user_banners" class="reversed mb-m" label="Show user banners" hint="When enabled, custom banners set by users are shown at the bottom of their posts." />

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
      hint="Threaded view only - when enabled, reply sub-trees are expanded automatically on each post."
      :disabled="settings.discussion_view_mode === 'flat'"
    />

    <Divider class="my-l" />

    <strong class="text-color-lighter text-s block mb-m">
      Forum
    </strong>

    <Switch v-model="settings.show_forum_updates" class="reversed mb-m" label="Show latest activity" />
    <Switch v-model="settings.show_forum_recently_visited" class="reversed mb-m" label="Show recently visited" />
    <Switch v-model="settings.show_forum_archived" class="reversed" label="Show archived topics & discussions" />

    <Divider class="my-l" />

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
