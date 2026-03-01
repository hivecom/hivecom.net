<script setup lang="ts">
import { Popout } from '@dolanske/vui'

const emit = defineEmits <{
  (e: 'reaction', reaction: string): void
}>()

const anchor = useTemplateRef('anchor')
const open = ref(false)

// TODO: support for stickers (should take 2 or 3 rows of a grid space)
// TODO: implement provider based fetching
// TODO: split components into ReactionList (for reactions) and ReactionButton (for listing reactions)
//  - ReactionList should support max amount of reactions per person
//  - ReactionList should count reactions
//

const SampleEmotes = ['👍', '👎', '❤️', '😂', '😢', '🤔', '🚀', '🎉', '💀', '😳', '😳', '🤧', '🌡️', '🌞', '🕶️', '🆒', '💯', '💅', '🏳️‍🌈']

function selectEmote(emote: string) {
  emit('reaction', emote)
  open.value = false
}
</script>

<template>
  <button ref="anchor" class="reactions__button" @click="open = !open">
    <Icon name="ph:smiley" :size="20" />
  </button>

  <Popout :anchor :visible="open" @click-outside="open = false">
    <div class="reactions__grid">
      <button v-for="emote of SampleEmotes" :key="emote" class="reactions__button" @click="selectEmote(emote)">
        {{ emote }}
      </button>
    </div>
  </Popout>
</template>

<style scoped lang="scss">
.reactions__trigger {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 32px;
  height: 32px;
  border-radius: 99px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg);

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.reactions__grid {
  display: grid;
  grid-template-columns: repeat(8, 32px);
  grid-auto-rows: 32px;
  gap: 2px;
  max-height: 256px;
  padding: var(--space-xs);
}
</style>
