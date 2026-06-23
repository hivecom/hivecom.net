<script setup lang="ts">
import { Drawer, EmojiPicker, Popout } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** Show the user's quick-reaction strip above the full picker. */
  quick?: boolean
}>(), {
  quick: true,
})

const emit = defineEmits<{
  (e: 'reaction', reaction: string): void
}>()

const anchor = useTemplateRef('anchor')
const open = ref(false)
const isMobile = useBreakpoint('<s')

const { settings } = useDataUserSettings()
const quickReactions = computed(() => (props.quick ? settings.value.quick_reactions : []))

function toggle() {
  open.value = !open.value
}

function selectEmote(emote: string) {
  emit('reaction', emote)
  open.value = false
}
</script>

<template>
  <div ref="anchor" v-bind="$attrs" class="inline-block" :class="{ 'reactions-anchor-active': open }">
    <slot :toggle="toggle">
      <div role="button" class="reactions__button" @click="toggle">
        <Icon name="ph:smiley" :size="20" class="text-color-lighter" />
      </div>
    </slot>
  </div>

  <Drawer v-if="isMobile" :open="open" class="reactions__list-drawer" @close="open = false">
    <div v-if="quickReactions.length" class="reactions__quick">
      <button
        v-for="emote in quickReactions"
        :key="emote"
        type="button"
        class="reactions__button"
        @click="selectEmote(emote)"
      >
        {{ emote }}
      </button>
    </div>
    <EmojiPicker @select="({ emoji }) => selectEmote(emoji)" />
  </Drawer>
  <Popout v-else :anchor :visible="open" class="reactions__list-popout" @click-outside="open = false">
    <div v-if="quickReactions.length" class="reactions__quick">
      <button
        v-for="emote in quickReactions"
        :key="emote"
        type="button"
        class="reactions__button"
        @click="selectEmote(emote)"
      >
        {{ emote }}
      </button>
    </div>
    <EmojiPicker @select="({ emoji }) => selectEmote(emoji)" />
  </Popout>
</template>
