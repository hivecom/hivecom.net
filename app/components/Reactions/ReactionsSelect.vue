<script setup lang="ts">
import { Drawer, Popout } from '@dolanske/vui'
import { createReusableTemplate } from '@vueuse/core'
import { useBreakpoint } from '@/lib/mediaQuery'

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
    emotes: ['💅', '🚀', '🏳️‍🌈', '🗿', '🍆', '🍑', '💦', '🌡️', '☀️', '🌧️', '🌞', '🌚', '🌿', '🌱', '🥀', '🐺', '🥚'],
  },
]

const anchor = useTemplateRef('anchor')
const open = ref(false)
const isMobile = useBreakpoint('<s')

const [DefinePickerContent, PickerContent] = createReusableTemplate()

function toggle() {
  open.value = !open.value
}

function selectEmote(emote: string) {
  emit('reaction', emote)
  open.value = false
}
</script>

<template>
  <DefinePickerContent>
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
  </DefinePickerContent>

  <div ref="anchor" class="inline-block" :class="{ 'reactions-anchor-active': open }">
    <slot :toggle="toggle">
      <div role="button" class="reactions__button" @click="toggle">
        <Icon name="ph:smiley" :size="20" class="text-color-lighter" />
      </div>
    </slot>
  </div>

  <Drawer v-if="isMobile" :open="open" @close="open = false">
    <PickerContent />
  </Drawer>
  <Popout v-else :anchor :visible="open" @click-outside="open = false">
    <PickerContent />
  </Popout>
</template>
