<script setup lang="ts">
import { Button, ButtonGroup, Card, Divider, Flex, Select, Slider, Switch } from '@dolanske/vui'
import { onMounted } from 'vue'
import SoundChoicePicker from '@/components/Shared/SoundChoicePicker.vue'
import { usePushNotifications } from '@/composables/usePushNotifications'
import { useBreakpoint } from '@/lib/mediaQuery'
import { NONE_SOUND_ID } from '@/lib/notificationSound'

// On mobile the device/OS volume governs playback, so the in-app volume slider
// is hidden and notifications always play at full volume.
const isMobile = useBreakpoint('<s')

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

async function toggleAppBrowserNotifications(value: boolean) {
  if (value && typeof Notification !== 'undefined') {
    const permission = await Notification.requestPermission()
    settings.value.app_browser_notifications = permission === 'granted'
  }
  else {
    settings.value.app_browser_notifications = false
  }
}

const {
  isSupported: pushSupported,
  isStandalone: pushStandalone,
  isSubscribed: pushSubscribed,
  loading: pushLoading,
  subscribe: subscribePush,
  unsubscribe: unsubscribePush,
  refresh: refreshPush,
} = usePushNotifications()

onMounted(() => {
  void refreshPush()
})

async function togglePushNotifications(value: boolean) {
  if (value)
    await subscribePush()
  else
    await unsubscribePush()
}
</script>

<template>
  <Card v-if="!settingsError" class="card-bg" separators>
    <template #header>
      <h4>
        General
      </h4>
    </template>

    <Flex y-center gap="xs" class="text-color-lighter mb-m">
      <Icon name="ph:palette" size="16" />
      <strong class="text-s">Appearance</strong>
    </Flex>
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

    <Flex y-center gap="xs" class="text-color-lighter mb-m">
      <Icon name="ph:bell" size="16" />
      <strong class="text-s">Notifications</strong>
    </Flex>
    <SoundChoicePicker
      v-model="settings.notification_sound_choice"
      v-model:url="settings.notification_sound_url"
      v-model:design="settings.notification_sound_design"
      label="Notification sound"
      description="Play a sound when you receive a new notification, mention, or friend request."
      :volume="isMobile ? 100 : settings.notification_sound_volume"
      class="mb-m"
    />
    <Flex v-if="!isMobile" column gap="xs" expand class="mb-m">
      <Flex y-center x-between expand>
        <Flex column gap="xxs">
          <span class="text-m">Volume</span>
          <span class="text-xs text-color-lighter">Loudness of the notification sound.</span>
        </Flex>
        <span class="text-s text-color-light">{{ settings.notification_sound_volume }}%</span>
      </Flex>
      <Slider
        v-model="settings.notification_sound_volume"
        :min="0"
        :max="100"
        :step="5"
        :disabled="settings.notification_sound_choice === NONE_SOUND_ID"
      />
    </Flex>
    <Switch
      :model-value="settings.app_browser_notifications"
      class="reversed mb-m"
      label="Background notifications"
      hint="Show a system notification when you receive activity while this tab is in the background. Delivery may lag by a few minutes since we don't keep a live connection open when the tab is hidden."
      @update:model-value="toggleAppBrowserNotifications"
    />
    <Switch
      v-if="pushSupported"
      :model-value="pushSubscribed"
      :disabled="pushLoading"
      class="reversed"
      label="Push notifications"
      :hint="pushStandalone
        ? 'Deliver notifications to this device even when Hivecom is closed. Works on this installed app.'
        : 'Deliver notifications to this device even when Hivecom is closed. On iOS, add Hivecom to your home screen first.'"
      @update:model-value="togglePushNotifications"
    />

    <Divider class="my-l" />

    <Flex y-center gap="xs" class="text-color-lighter mb-m">
      <Icon name="ph:person-arms-spread" size="16" />
      <strong class="text-s">Accessibility</strong>
    </Flex>
    <Switch v-model="settings.allow_browser_zoom" class="reversed mb-m" label="Allow browser zoom" hint="When enabled, pinch-to-zoom and trackpad zoom work across the whole site. Image and video lightboxes support zooming regardless of this setting." />
    <Switch v-model="settings.confirm_external_links" class="reversed" label="Confirm off-site links" hint="When enabled, clicking a link in user content that leads off Hivecom asks you to confirm before opening it." />

    <Divider class="my-l" />

    <Flex y-center gap="xs" class="text-color-lighter mb-m">
      <Icon name="ph:chats-circle" size="16" />
      <strong class="text-s">Discussions</strong>
    </Flex>
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

    <Flex y-center gap="xs" class="text-color-lighter mb-m">
      <Icon name="ph:newspaper" size="16" />
      <strong class="text-s">Forum</strong>
    </Flex>

    <Switch v-model="settings.show_forum_updates" class="reversed mb-m" label="Show latest activity" />
    <Switch v-model="settings.show_forum_recently_visited" class="reversed mb-m" label="Show recently visited" />
    <Switch v-model="settings.show_forum_archived" class="reversed mb-m" label="Show archived topics & discussions" />

    <Flex x-between y-center>
      <div>
        <p>Forum loading</p>
        <p class="text-xs text-color-lightest">
          How to load and display more replies. Paginated load is faster on initial load and better for performance, while infinite scroll is more convenient for browsing through large discussions.
        </p>
      </div>
      <ButtonGroup size="s">
        <Button
          :variant="settings.forum_pagination_mode === 'infinite' ? 'accent' : 'gray'"
          size="s"
          @click="settings.forum_pagination_mode = 'infinite'"
        >
          Infinite
        </Button>
        <Button
          :variant="settings.forum_pagination_mode === 'paginated' ? 'accent' : 'gray'"
          size="s"
          @click="settings.forum_pagination_mode = 'paginated'"
        >
          Pages
        </Button>
      </ButtonGroup>
    </Flex>

    <Divider class="my-l" />

    <Flex y-center gap="xs" class="text-color-lighter mb-m">
      <Icon name="ph:text-aa" size="16" />
      <strong class="text-s">Rich Text Editor</strong>
    </Flex>

    <Switch v-model="settings.editor_floating" class="reversed mb-m" label="Floating text editor" hint="If enabled, the text editor will stay at the bottom of the screen while scrolling through large forum posts." />
    <Switch v-model="settings.strip_image_metadata" class="reversed" label="Strip image metadata on upload" hint="Removes EXIF and other embedded metadata from images before uploading. Disable if you need to preserve location, camera, or other metadata." />
  </Card>
</template>

<style lang="scss" scoped>
:deep(.vui-slider.is-disabled) {
  // Mute the fill so a disabled volume slider doesn't read as active accent.
  --vui-slider-indicator: var(--color-border-strong);
}

:deep(.vui-switch) {
  &.disabled {
    filter: grayscale(100%) opacity(0.6);

    & + p {
      filter: grayscale(100%) opacity(0.4);
    }
  }
}
</style>
