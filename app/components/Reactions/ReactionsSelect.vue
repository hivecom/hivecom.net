<script setup lang="ts">
import { Popout } from '@dolanske/vui'

const emit = defineEmits<{
  (e: 'reaction', reaction: string): void
}>()

const EMOTE_GROUPS: { label: string, emotes: string[] }[] = [
  {
    label: 'Reactions',
    emotes: ['👍', '👎', '🙌', '❤️', '🔥', '🎉', '👀', '💯', '💀', '⭐', '🏆'],
  },
  {
    label: 'Emoticons',
    emotes: ['😂', '😢', '😭', '😳', '🤯', '😍', '😡', '🤔', '😴', '🫠'],
  },
  {
    label: 'Symbols',
    emotes: ['✅', '❎', '🅰️', '🅱️', '🆒', '🆗', '⚠️'],
  },
  {
    label: 'Other',
    emotes: ['💅', '🚀', '🏳️‍🌈', '🗿', '🍆', '🍑', '💦', '🌡️', '☀️', '🌧️', '🌞', '🌚', '🌿', '🌱', '🥀'],
  },
]

const anchor = useTemplateRef('anchor')
const open = ref(false)

function selectEmote(emote: string) {
  emit('reaction', emote)
  open.value = false
}
</script>

<template>
  <button ref="anchor" class="reactions__button reactions__button--trigger" @click="open = !open">
    <Icon name="ph:smiley" :size="20" />
  </button>

  <Popout :anchor :visible="open" @click-outside="open = false">
    <div class="reactions__picker">
      <div v-for="group in EMOTE_GROUPS" :key="group.label" class="reactions__group">
        <p class="reactions__group-label">
          {{ group.label }}
        </p>
        <div class="reactions__grid">
          <button
            v-for="emote in group.emotes"
            :key="emote"
            class="reactions__button"
            @click="selectEmote(emote)"
          >
            {{ emote }}
          </button>
        </div>
      </div>
    </div>
  </Popout>
</template>

<style scoped lang="scss">
.reactions__button--trigger {
  .iconify {
    color: var(--color-text-lighter);
  }
}

.reactions__picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-s);
  max-height: 320px;
  overflow-y: auto;
  width: 260px;
}

.reactions__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.reactions__group-label {
  font-size: var(--font-size-xxs);
  color: var(--color-text-lighter);
  text-transform: uppercase;
  padding: 0 2px;
  margin: 0;
}

.reactions__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
</style>
