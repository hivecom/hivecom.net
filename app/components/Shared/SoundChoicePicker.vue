<script setup lang="ts">
import type { SoundDesign } from '@/types/sound'
import { Button, Flex, Input, Select, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import SoundDesigner from '@/components/Shared/SoundDesigner.vue'
import { CUSTOM_SOUND_ID, DESIGN_SOUND_ID, NONE_SOUND_ID, playNotificationSound, SOUND_PRESETS } from '@/lib/notificationSound'

const props = withDefaults(defineProps<{
  label: string
  description?: string
  // 0-100, used only for the preview button.
  volume?: number
  // Label text size token; defaults to `m` (general settings). The chat modal
  // passes `s` to match its denser sibling labels.
  labelSize?: 'xs' | 's' | 'm'
}>(), {
  description: '',
  volume: 100,
  labelSize: 'm',
})

// Preset id, NONE_SOUND_ID, CUSTOM_SOUND_ID, or DESIGN_SOUND_ID.
const choice = defineModel<string>({ required: true })
// Only meaningful when choice is CUSTOM_SOUND_ID.
const url = defineModel<string>('url', { default: '' })
// Only meaningful when choice is DESIGN_SOUND_ID.
const design = defineModel<SoundDesign | null>('design', { default: null })

interface SoundOption { label: string, value: string }

const noneSoundOption: SoundOption = { label: 'None', value: NONE_SOUND_ID }

// "None" disables the cue; presets; then "Custom URL" and "Custom design"
// which reveal their respective controls.
const soundOptions: SoundOption[] = [
  noneSoundOption,
  ...SOUND_PRESETS.map(preset => ({ label: preset.label, value: preset.id })),
  { label: 'Custom URL', value: CUSTOM_SOUND_ID },
  { label: 'Custom Design', value: DESIGN_SOUND_ID },
]

// VUI <Select> binds to an array of option objects; adapt that to/from the
// plain string id stored in the model.
const selected = computed<SoundOption[]>({
  get() {
    return [soundOptions.find(o => o.value === choice.value) ?? noneSoundOption]
  },
  set(value) {
    if (value[0])
      choice.value = value[0].value
  },
})

const designerOpen = ref(false)

const designTooltip = computed(() => {
  const count = design.value?.length ?? 0
  return count > 0
    ? `Edit design (${count} ${count === 1 ? 'tone' : 'tones'})`
    : 'Create design'
})

// Design chosen but nothing authored yet: nudge toward the designer (accent) and
// disable preview since there's nothing to play.
const isEmptyDesign = computed(() =>
  choice.value === DESIGN_SOUND_ID && (design.value?.length ?? 0) === 0,
)

function preview() {
  playNotificationSound(choice.value, url.value, props.volume / 100, design.value)
}
</script>

<template>
  <Flex column gap="xs" expand>
    <Flex y-center x-between gap="xxs" expand>
      <Flex column gap="xxs" class="sound-picker__text">
        <span :class="`text-${labelSize}`">{{ label }}</span>
        <span v-if="description" class="text-xs text-color-lighter">{{ description }}</span>
      </Flex>
      <Flex y-center gap="xxs">
        <Tooltip>
          <Button variant="gray" size="s" square :disabled="choice === NONE_SOUND_ID || isEmptyDesign" @click="preview">
            <Icon name="ph:play" />
          </Button>
          <template #tooltip>
            Play
          </template>
        </Tooltip>
        <Tooltip v-if="choice === DESIGN_SOUND_ID">
          <Button :variant="isEmptyDesign ? 'accent' : 'gray'" size="s" square @click="designerOpen = true">
            <Icon name="ph:sliders-horizontal" />
          </Button>
          <template #tooltip>
            {{ designTooltip }}
          </template>
        </Tooltip>
        <Select v-model="selected" size="s" :options="soundOptions" :show-clear="false" />
      </Flex>
    </Flex>
    <Input
      v-if="choice === CUSTOM_SOUND_ID"
      v-model="url"
      expand
      size="s"
      placeholder="Custom sound URL"
    />
    <SoundDesigner v-model:open="designerOpen" v-model:design="design" :volume="volume" />
  </Flex>
</template>

<style lang="scss" scoped>
.sound-picker__text {
  flex: 1;
}
</style>
