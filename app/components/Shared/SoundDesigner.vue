<script setup lang="ts">
import type { SoundDesign } from '@/types/sound'
import { Button, Divider, Flex, Modal, Slider, Switch, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import {
  DESIGN_MAX_GAIN,
  DESIGN_MAX_TONES,
  DESIGN_SOUND_ID,
  playNotificationSound,
} from '@/lib/notificationSound'

const props = withDefaults(defineProps<{
  // 0-100, used only for the preview button.
  volume?: number
}>(), {
  volume: 100,
})

const isOpen = defineModel<boolean>('open', { default: false })
const design = defineModel<SoundDesign | null>('design', { default: null })

const isBelowSmall = useBreakpoint('<xs')

// A single tone is edited with a flattened shape: `glide` toggles the optional
// `endFreq`, and `attack` is always present (it has a sensible default). The
// shape is mapped back to a `SoundDesign` on save / preview.
interface EditableTone {
  freq: number
  glide: boolean
  endFreq: number
  start: number
  duration: number
  gain: number
  attack: number
}

function defaultTone(): EditableTone {
  return { freq: 660, glide: false, endFreq: 220, start: 0, duration: 0.12, gain: 0.18, attack: 0.01 }
}

function fromDesign(value: SoundDesign | null): EditableTone[] {
  if (!value || value.length === 0)
    return [defaultTone()]
  return value.map(t => ({
    freq: t.freq,
    glide: t.endFreq != null,
    endFreq: t.endFreq ?? Math.round(t.freq / 2),
    start: t.start,
    duration: t.duration,
    gain: t.gain,
    attack: t.attack ?? 0.01,
  }))
}

const tones = ref<EditableTone[]>([defaultTone()])

// Re-seed the editor from the saved design whenever the modal opens, so a
// cancelled session never leaks into the next one.
watch(isOpen, (open) => {
  if (open)
    tones.value = fromDesign(design.value)
})

const canAddTone = computed(() => tones.value.length < DESIGN_MAX_TONES)

function toDesign(list: EditableTone[]): SoundDesign {
  return list.map((t) => {
    const tone = { freq: t.freq, start: t.start, duration: t.duration, gain: t.gain, attack: t.attack } as SoundDesign[number]
    if (t.glide)
      tone.endFreq = t.endFreq
    return tone
  })
}

function addTone() {
  if (canAddTone.value)
    tones.value.push(defaultTone())
}

function removeTone(index: number) {
  tones.value.splice(index, 1)
  if (tones.value.length === 0)
    tones.value = [defaultTone()]
}

// Pitch glide is edited with a range slider, which only encodes the two pitch
// bounds (`start <= end`). Direction (which bound the glide *starts* on) is kept
// in `freq`/`endFreq` themselves: `freq <= endFreq` means a rising glide. The
// low/high handles map onto whichever of the two is smaller/larger, and the
// swap button flips the direction without changing the bounds.
function glideLow(t: EditableTone): number {
  return Math.min(t.freq, t.endFreq)
}

function glideHigh(t: EditableTone): number {
  return Math.max(t.freq, t.endFreq)
}

function setGlideLow(t: EditableTone, value: number) {
  if (t.freq <= t.endFreq)
    t.freq = value
  else
    t.endFreq = value
}

function setGlideHigh(t: EditableTone, value: number) {
  if (t.freq <= t.endFreq)
    t.endFreq = value
  else
    t.freq = value
}

function swapGlide(t: EditableTone) {
  const from = t.freq
  t.freq = t.endFreq
  t.endFreq = from
}

// Timing is edited as a range on a shared timeline: the low handle is the tone's
// `start`, the high handle is its end (`start + duration`). Length is derived
// from the gap between them.
const MIN_DURATION = 0.005

function timeStart(t: EditableTone): number {
  return t.start
}

function timeEnd(t: EditableTone): number {
  return t.start + t.duration
}

function setTimeStart(t: EditableTone, value: number) {
  const end = t.start + t.duration
  t.start = value
  t.duration = Math.max(MIN_DURATION, end - value)
}

function setTimeEnd(t: EditableTone, value: number) {
  t.duration = Math.max(MIN_DURATION, value - t.start)
}

function preview() {
  playNotificationSound(DESIGN_SOUND_ID, undefined, props.volume / 100, toDesign(tones.value))
}

function save(close: () => void) {
  design.value = toDesign(tones.value)
  close()
}

// Slider value formatters.
function ms(seconds: number): string {
  return `${Math.round(seconds * 1000)} ms`
}
</script>

<template>
  <Modal
    :open="isOpen"
    :card="{ separators: true }"
    :size="isBelowSmall ? 'screen' : 'l'"
    @close="isOpen = false"
  >
    <template #header>
      <Flex x-between y-center expand class="pr-s">
        <Flex column :gap="0">
          <h4>Design sound</h4>
          <span class="text-xs text-color-light">Layer up to {{ DESIGN_MAX_TONES }} tones into a custom cue.</span>
        </Flex>
        <Tooltip>
          <Button variant="gray" square @click="preview">
            <Icon name="ph:play" />
          </Button>
          <template #tooltip>
            Preview
          </template>
        </Tooltip>
      </Flex>
    </template>

    <Flex column gap="m" expand class="sound-designer">
      <Flex
        v-for="(tone, index) in tones"
        :key="index"
        column
        gap="s"
        expand
        class="sound-designer__tone"
      >
        <Flex y-center x-between gap="s" expand>
          <strong class="text-s">Tone {{ index + 1 }}</strong>
          <Flex y-center gap="xs">
            <Switch v-model="tone.glide" label="Glide" reversed />
            <Tooltip v-if="tone.glide">
              <Button variant="gray" size="s" square @click="swapGlide(tone)">
                <Icon :name="tone.freq <= tone.endFreq ? 'ph:arrow-up-right' : 'ph:arrow-down-right'" />
              </Button>
              <template #tooltip>
                {{ tone.freq <= tone.endFreq ? 'Rising glide' : 'Falling glide' }} - tap to flip
              </template>
            </Tooltip>
            <Tooltip>
              <Button
                variant="gray"
                size="s"
                square
                :disabled="tones.length === 1"
                @click="removeTone(index)"
              >
                <Icon name="ph:trash" />
              </Button>
              <template #tooltip>
                Remove tone
              </template>
            </Tooltip>
          </Flex>
        </Flex>

        <Flex column gap="xs" expand>
          <Flex y-center x-between expand>
            <span class="text-xs text-color-light">Frequency</span>
            <span class="text-xs text-color-light">
              <template v-if="tone.glide">{{ Math.round(tone.freq) }} &rarr; {{ Math.round(tone.endFreq) }} Hz</template>
              <template v-else>{{ Math.round(tone.freq) }} Hz</template>
            </span>
          </Flex>
          <Slider
            v-if="tone.glide"
            range
            :min="50"
            :max="4000"
            :start="glideLow(tone)"
            :end="glideHigh(tone)"
            @update:start="(value: number) => setGlideLow(tone, value)"
            @update:end="(value: number) => setGlideHigh(tone, value)"
          />
          <Slider v-else v-model="tone.freq" :min="50" :max="4000" />
        </Flex>

        <Flex column gap="xs" expand>
          <Flex y-center x-between expand>
            <span class="text-xs text-color-light">Timing</span>
            <span class="text-xs text-color-light">start {{ ms(tone.start) }} &middot; length {{ ms(tone.duration) }}</span>
          </Flex>
          <Slider
            range
            :min="0"
            :max="3"
            :steps="60"
            :round="3"
            :start="timeStart(tone)"
            :end="timeEnd(tone)"
            @update:start="(value: number) => setTimeStart(tone, value)"
            @update:end="(value: number) => setTimeEnd(tone, value)"
          />
        </Flex>

        <Flex y-center gap="m" expand wrap>
          <Flex column gap="xs" class="sound-designer__field">
            <Flex y-center x-between expand>
              <span class="text-xs text-color-light">Volume</span>
              <span class="text-xs text-color-light">{{ Math.round((tone.gain / DESIGN_MAX_GAIN) * 100) }}%</span>
            </Flex>
            <Slider v-model="tone.gain" :min="0" :max="DESIGN_MAX_GAIN" :round="2" />
          </Flex>
          <Flex column gap="xs" class="sound-designer__field">
            <Flex y-center x-between expand>
              <span class="text-xs text-color-light">Attack</span>
              <span class="text-xs text-color-light">{{ ms(tone.attack) }}</span>
            </Flex>
            <Slider v-model="tone.attack" :min="0" :max="1" :round="3" />
          </Flex>
        </Flex>

        <Divider v-if="index < tones.length - 1" />
      </Flex>

      <Button variant="gray" :disabled="!canAddTone" @click="addTone">
        <Icon name="ph:plus" />
        Add tone
      </Button>
    </Flex>

    <template #footer="{ close }">
      <Flex gap="xs" x-end expand>
        <Button :expand="isBelowSmall" @click="close">
          Cancel
        </Button>
        <Button variant="accent" :expand="isBelowSmall" @click="save(close)">
          Save
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.sound-designer {
  // Slim the slider handles down from the 20px default for a tighter editor.
  // The token must be set on `.vui-slider` itself - VUI declares the 20px
  // default there, which beats any value merely inherited from an ancestor.
  :deep(.vui-slider) {
    --vui-slider-handle-size: 14px;
  }

  // Shrink the switch. The track height follows `--vui-switch-size`, but its
  // width is a hard-coded 44px in VUI, so narrow it too for a proportional pill.
  :deep(.vui-switch) {
    --vui-switch-size: 18px;

    .vui-switch-icon {
      width: 32px;
    }

    // VUI renders the label as a base-size paragraph; match the small UI text.
    .vui-switch-content {
      font-size: var(--font-size-s);
    }
  }
}

.sound-designer__field {
  flex: 1;
  min-width: 140px;
}
</style>
