<script setup lang="ts">
import { Badge, Button, Flex, Input, Modal, Slider, Switch } from '@dolanske/vui'
import { ref } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

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
] as const
</script>

<template>
  <Modal :open="open" size="s" @close="emit('close')">
    <template #header>
      <h4>Chat settings</h4>
    </template>

    <Flex column gap="m" expand>
      <Flex
        v-for="option in options"
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

      <Flex column gap="xs" expand>
        <Flex y-center x-between expand>
          <Flex column gap="xxs" class="chat-settings__text">
            <span class="chat-settings__label">Message font size</span>
            <span class="chat-settings__desc">Adjust the size of text in the message log.</span>
          </Flex>
          <span class="chat-settings__value">{{ settings.chat_font_size }}px</span>
        </Flex>
        <Slider v-model="settings.chat_font_size" :min="10" :max="20" :step="1" />
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
