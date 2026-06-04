<script setup lang="ts">
import { Badge, Button, ButtonGroup, Flex, Input, Modal, Slider, Switch } from '@dolanske/vui'
import { ref } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const isMobile = useBreakpoint('<s')
const isDev = import.meta.dev
const { settings } = useDataUserSettings()

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
    key: 'chat_colored_nicks',
    label: 'Colored nicknames',
    description: 'Give each nickname a consistent color in the message log.',
  },
  {
    key: 'chat_notify_only_mentions',
    label: 'Only notify on mentions',
    description: 'Show the navbar chat dot only when you are mentioned, not for all activity.',
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
      <Flex v-if="!isMobile" y-center x-between expand>
        <Flex column gap="xxs" class="chat-settings__text">
          <span class="chat-settings__label">Display mode</span>
          <span class="chat-settings__desc">IRC shows plain text. Modern resolves nicks to Hivecom profiles.</span>
        </Flex>
        <ButtonGroup>
          <Button :variant="settings.chat_display_mode === 'irc' ? 'accent' : 'gray'" @click="settings.chat_display_mode = 'irc'">
            IRC
          </Button>
          <Button :variant="settings.chat_display_mode === 'modern' ? 'accent' : 'gray'" @click="settings.chat_display_mode = 'modern'">
            Modern
          </Button>
        </ButtonGroup>
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
          <span class="chat-settings__label">{{ option.label }}</span>
          <span class="chat-settings__desc">{{ option.description }}</span>
        </Flex>
        <Switch v-model="settings[option.key]" />
      </Flex>

      <Flex v-if="isDev" y-center x-between expand>
        <Flex column gap="xxs" class="chat-settings__text">
          <span class="chat-settings__label">Tag message display</span>
          <span class="chat-settings__desc">Control which IRCv3 TAGMSG events appear in the message log. Known events (typing, reactions) are always hidden.</span>
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

      <Flex y-center x-between gap="m" expand>
        <Flex column gap="xxs" class="chat-settings__text">
          <span class="chat-settings__label">Browser notifications</span>
          <span class="chat-settings__desc">Show a system notification when you are mentioned while the tab is in the background.</span>
        </Flex>
        <Switch :model-value="settings.chat_browser_notifications" @update:model-value="toggleBrowserNotifications" />
      </Flex>

      <Flex v-if="!isMobile" column gap="xs" expand>
        <Flex y-center x-between expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="chat-settings__label">Message font size</span>
            <span class="chat-settings__desc">Adjust the size of text in the message log.</span>
          </Flex>
          <span class="chat-settings__value">{{ settings.chat_font_size }}px</span>
        </Flex>
        <Slider v-model="settings.chat_font_size" :min="10" :max="20" :step="1" />
      </Flex>

      <Flex v-if="isMobile" column gap="xs" expand>
        <Flex y-center x-between expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="chat-settings__label">Message font size</span>
            <span class="chat-settings__desc">Adjust the size of text in the message log.</span>
          </Flex>
          <span class="chat-settings__value">{{ settings.chat_mobile_font_size }}px</span>
        </Flex>
        <Slider v-model="settings.chat_mobile_font_size" :min="10" :max="24" :step="1" />
      </Flex>

      <Flex v-if="!isMobile" column gap="xs" expand>
        <Flex y-center x-between expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="chat-settings__label">Timestamp format</span>
            <span class="chat-settings__desc">Standard dayjs format string, e.g. HH:mm:ss or DD/MM/YYYY HH:mm.</span>
          </Flex>
        </Flex>
        <Input v-model="settings.chat_timestamp_format" expand placeholder="HH:mm:ss" :disabled="!settings.chat_show_timestamps" />
      </Flex>

      <Flex column gap="xs" expand>
        <Flex column gap="xxs" class="chat-settings__text">
          <span class="chat-settings__label">Mention keywords</span>
          <span class="chat-settings__desc">Highlight messages containing any of these words, in addition to your nickname.</span>
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
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
.chat-settings {
  &__text {
    flex: 1;
  }

  &__label {
    font-size: var(--font-size-s);
    color: var(--color-text);
  }

  &__desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__value {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
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
