<script setup lang="ts">
import { Badge, Button, ButtonGroup, Divider, Flex, Input, Modal, Slider, Switch, Tab, Tabs } from '@dolanske/vui'
import { ref, watch } from 'vue'
import SoundChoicePicker from '@/components/Shared/SoundChoicePicker.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useErgoPush } from '@/composables/useErgoPush'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'
import { NONE_SOUND_ID } from '@/lib/notificationSound'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const isMobile = useBreakpoint('<s')
const isDev = import.meta.dev
const { settings } = useDataUserSettings()

// Chat push notifications (Ergo draft/webpush). The server VAPID key only exists
// once connected to a webpush-capable server, so the toggle is gated on it.
const { vapidKey } = useIrcChat()
const {
  isSupported: pushSupported,
  isSubscribed: pushSubscribed,
  loading: pushLoading,
  subscribe: subscribePush,
  unsubscribe: unsubscribePush,
  refresh: refreshPush,
} = useErgoPush()

// The modal stays mounted with an `open` prop, so reconcile push state each time
// it opens rather than only once on mount.
watch(() => props.open, (open) => {
  if (open)
    void refreshPush()
})

async function toggleChatPush(value: boolean) {
  if (value)
    await subscribePush()
  else
    await unsubscribePush()
}

const activeTab = ref<'display' | 'notifications'>('display')
const keywordDraft = ref('')

function addKeyword() {
  const value = keywordDraft.value.trim()
  if (!value)
    return
  const exists = settings.value.chat_mention_keywords.some(k => k.toLowerCase() === value.toLowerCase())
  if (!exists)
    settings.value.chat_mention_keywords = [...settings.value.chat_mention_keywords, value]
  keywordDraft.value = ''
}

function removeKeyword(index: number) {
  settings.value.chat_mention_keywords = settings.value.chat_mention_keywords.filter((_, i) => i !== index)
}

const options = [
  {
    key: 'chat_typing_indicators',
    label: 'Typing indicators',
    description: 'Show when others are typing, and let them see when you are. Disable for more privacy.',
  },
  {
    key: 'chat_colored_nicks',
    label: 'Colored nicknames',
    description: 'Give each nickname a consistent color in the message log.',
  },
  {
    key: 'chat_autoconnect',
    label: 'Auto-connect on site open',
    description: 'Connect to chat automatically once you are signed in.',
  },
  {
    key: 'chat_show_inline_embeds',
    label: 'Show inline embeds',
    description: 'Render images and links inline in the message log.',
  },
  {
    key: 'chat_show_previews',
    label: 'Show image previews',
    description: 'Show inline image and video thumbnails in the message log.',
  },
  {
    key: 'chat_show_timestamps',
    label: 'Show timestamps',
    description: 'Display the time each message was sent. Hidden automatically in compact mode.',
    hideOnMobile: true,
  },
] as const

async function toggleBrowserNotifications(value: boolean) {
  if (value) {
    const permission = await Notification.requestPermission()
    settings.value.chat_browser_notifications = permission === 'granted'
  }
  else {
    settings.value.chat_browser_notifications = false
  }
}
</script>

<template>
  <Modal :open="open" :size="isMobile ? 'screen' : 'm'" @close="emit('close')">
    <template #header>
      <h4>Chat settings</h4>
    </template>

    <Flex column gap="m" expand>
      <Tabs v-model="activeTab">
        <Tab value="display">
          Display
        </Tab>
        <Tab value="notifications">
          Notifications
        </Tab>
      </Tabs>

      <!-- Display & Behavior -->
      <template v-if="activeTab === 'display'">
        <Flex v-if="!isMobile" y-center x-between expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">Display mode</span>
            <span class="text-xs text-color-lighter">Modern has padding, avatars, icons, full previews. IRC is compact, text focused.</span>
          </Flex>
          <ButtonGroup>
            <Button :variant="settings.chat_display_mode === 'modern' ? 'accent' : 'gray'" @click="settings.chat_display_mode = 'modern'">
              Modern
            </Button>
            <Button :variant="settings.chat_display_mode === 'irc' ? 'accent' : 'gray'" @click="settings.chat_display_mode = 'irc'">
              IRC
            </Button>
          </ButtonGroup>
        </Flex>

        <Flex v-if="!isMobile" column gap="xs" expand>
          <Flex y-center x-between expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Message font size</span>
              <span class="text-xs text-color-lighter">Adjust the size of text in the message log.</span>
            </Flex>
            <span class="chat-settings__value text-s text-color-light">{{ settings.chat_font_size }}px</span>
          </Flex>
          <Slider v-model="settings.chat_font_size" :min="10" :max="20" :step="1" />
        </Flex>

        <Flex v-if="isMobile" column gap="xs" expand>
          <Flex y-center x-between expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Message font size</span>
              <span class="text-xs text-color-lighter">Adjust the size of text in the message log.</span>
            </Flex>
            <span class="chat-settings__value text-s text-color-light">{{ settings.chat_mobile_font_size }}px</span>
          </Flex>
          <Slider v-model="settings.chat_mobile_font_size" :min="10" :max="24" :step="1" />
        </Flex>

        <Flex
          v-for="option in options"
          v-show="!('hideOnMobile' in option && option.hideOnMobile && isMobile)"
          :key="option.key"
          y-center
          x-between
          gap="m"
          expand
        >
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">{{ option.label }}</span>
            <span class="text-xs text-color-lighter">{{ option.description }}</span>
          </Flex>
          <Switch v-model="settings[option.key]" />
        </Flex>

        <Flex y-center x-between gap="m" expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">IRC native modes</span>
            <span class="text-xs text-color-lighter">Show raw IRC mode symbols (~, &amp;, @, %, +) alongside role badges in user lists and menus.</span>
          </Flex>
          <Switch v-model="settings.chat_irc_native_modes" />
        </Flex>

        <Flex v-if="isDev" y-center x-between expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">Tag message display</span>
            <span class="text-xs text-color-lighter">Control which IRCv3 TAGMSG events appear in the message log. Known events (typing, reactions) are always hidden.</span>
          </Flex>
          <ButtonGroup>
            <Button :variant="settings.chat_show_tag_messages === 'none' ? 'accent' : 'gray'" @click="settings.chat_show_tag_messages = 'none'">
              None
            </Button>
            <Button :variant="settings.chat_show_tag_messages === 'unknown' ? 'accent' : 'gray'" @click="settings.chat_show_tag_messages = 'unknown'">
              Unknown
            </Button>
            <Button :variant="settings.chat_show_tag_messages === 'all' ? 'accent' : 'gray'" @click="settings.chat_show_tag_messages = 'all'">
              All
            </Button>
          </ButtonGroup>
        </Flex>

        <!-- IRC Mode - desktop only -->
        <template v-if="!isMobile && settings.chat_display_mode === 'irc'">
          <Divider />

          <strong class="text-color-lighter text-s block">IRC Mode</strong>

          <Flex y-center x-between gap="m" expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Show reactions</span>
              <span class="text-xs text-color-lighter">Show reaction buttons and counts inline after messages.</span>
            </Flex>
            <Switch v-model="settings.chat_irc_reactions" />
          </Flex>

          <Flex y-center x-between gap="m" expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Hide embedded links</span>
              <span class="text-xs text-color-lighter">Hide link text when the URL renders as an image, video, or embed.</span>
            </Flex>
            <Switch v-model="settings.chat_irc_hide_embedded_links" />
          </Flex>

          <Flex y-center x-between gap="m" expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Hide timestamps in sidebar</span>
              <span class="text-xs text-color-lighter">Hide message timestamps in the channel sidebar list.</span>
            </Flex>
            <Switch v-model="settings.chat_irc_hide_sidebar_timestamps" />
          </Flex>

          <Flex y-center x-between gap="m" expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Inline media</span>
              <span class="text-xs text-color-lighter">Show media at font height inline with text. Off shows them like modern mode.</span>
            </Flex>
            <Switch v-model="settings.chat_irc_inline_images" />
          </Flex>

          <Flex column gap="xs" expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Timestamp format</span>
              <span class="text-xs text-color-lighter">Format string for message timestamps, e.g. <code>MMM D, HH:mm</code>. Leave blank to use the default.</span>
            </Flex>
            <Input v-model="settings.chat_timestamp_format" expand size="s" placeholder="HH:mm:ss" />
          </Flex>
        </template>
      </template>

      <!-- Notifications -->
      <template v-if="activeTab === 'notifications'">
        <Flex y-center x-between gap="m" expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">Browser notifications</span>
            <span class="text-xs text-color-lighter">Show a system notification when you are mentioned while the tab is in the background.</span>
          </Flex>
          <Switch :model-value="settings.chat_browser_notifications" @update:model-value="toggleBrowserNotifications" />
        </Flex>

        <Flex v-if="pushSupported" y-center x-between gap="m" expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">Push notifications</span>
            <span class="text-xs text-color-lighter">
              {{ vapidKey
                ? 'Deliver chat mentions and messages to this device even when Hivecom is closed.'
                : 'Connect to chat to enable push notifications on this device.' }}
            </span>
          </Flex>
          <Switch :model-value="pushSubscribed" :disabled="pushLoading || !vapidKey" @update:model-value="toggleChatPush" />
        </Flex>

        <Flex y-center x-between gap="m" expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">Only notify on mentions</span>
            <span class="text-xs text-color-lighter">Show the navbar chat dot only when you are mentioned, not for all activity.</span>
          </Flex>
          <Switch v-model="settings.chat_notify_only_mentions" />
        </Flex>

        <Flex column gap="xs" expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="text-s">Mention keywords</span>
            <span class="text-xs text-color-lighter">Highlight messages containing any of these words, in addition to your nickname.</span>
          </Flex>
          <Flex gap="xs" expand>
            <Input
              v-model="keywordDraft"
              expand
              size="s"
              placeholder="Add a keyword"
              @keydown.enter.prevent="addKeyword"
            />
            <Button :disabled="!keywordDraft.trim()" @click="addKeyword">
              <template #icon>
                <Icon name="ph:plus" />
              </template>
              Add
            </Button>
          </Flex>
          <Flex v-if="settings.chat_mention_keywords.length" gap="xs" wrap>
            <Badge
              v-for="(keyword, index) in settings.chat_mention_keywords"
              :key="keyword"
              variant="accent"
              class="chat-settings__keyword"
            >
              {{ keyword }}
              <button type="button" class="chat-settings__keyword-remove" aria-label="Remove keyword" @click="removeKeyword(index)">
                <Icon name="ph:x" />
              </button>
            </Badge>
          </Flex>
        </Flex>

        <!-- Sounds -->
        <Divider />

        <strong class="text-color-lighter text-s block">Sounds</strong>

        <SoundChoicePicker
          v-model="settings.chat_sound_mention_choice"
          v-model:url="settings.chat_sound_mention_url"
          v-model:design="settings.chat_sound_mention_design"
          label="Mention sound"
          label-size="s"
          description="Play a sound when you are mentioned or one of your keywords matches."
          :volume="isMobile ? 100 : settings.chat_sound_volume"
        />

        <SoundChoicePicker
          v-model="settings.chat_sound_message_choice"
          v-model:url="settings.chat_sound_message_url"
          v-model:design="settings.chat_sound_message_design"
          label="New message sound"
          label-size="s"
          description="Play a sound for any new message, not just mentions."
          :volume="isMobile ? 100 : settings.chat_sound_volume"
        />

        <Flex v-if="!isMobile" column gap="xs" expand>
          <Flex y-center x-between expand>
            <Flex column gap="xxs" class="chat-settings__text">
              <span class="text-s">Volume</span>
              <span class="text-xs text-color-lighter">Loudness of notification sounds.</span>
            </Flex>
            <span class="chat-settings__value text-s text-color-light">{{ settings.chat_sound_volume }}%</span>
          </Flex>
          <Slider
            v-model="settings.chat_sound_volume"
            :min="0"
            :max="100"
            :step="5"
            :disabled="settings.chat_sound_mention_choice === NONE_SOUND_ID && settings.chat_sound_message_choice === NONE_SOUND_ID"
          />
        </Flex>
      </template>
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
:deep(.vui-slider.is-disabled) {
  // Mute the fill so a disabled volume slider doesn't read as active accent.
  --vui-slider-indicator: var(--color-border-strong);
}

.chat-settings {
  &__text {
    flex: 1;
  }

  &__value {
    flex-shrink: 0;
  }

  &__keyword {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
  }

  &__keyword-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity var(--transition-fast);

    &:hover {
      opacity: 1;
    }
  }
}
</style>
