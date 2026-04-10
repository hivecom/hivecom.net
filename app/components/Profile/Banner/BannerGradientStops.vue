<script setup lang="ts">
import type { FillType, GradientStop } from './types'
import { Button, Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  stops: GradientStop[]
  fillType: FillType
  angle: number
  redraw: () => void
}>()

const emit = defineEmits<{
  'addStop': []
  'removeStop': [index: number]
  'setStopColor': [index: number, color: string]
  'setStopPosition': [index: number, position: number]
  'update:angle': [angle: number]
}>()
</script>

<template>
  <div class="banner-editor__stops">
    <div
      v-for="(stop, idx) in stops"
      :key="idx"
      class="banner-editor__stop-row"
    >
      <label class="banner-editor__swatch">
        <input
          :value="stop.color"
          type="color"
          class="banner-editor__color-input"
          @input="(e) => emit('setStopColor', idx, (e.target as HTMLInputElement).value)"
        >
        <span class="banner-editor__color-preview" :style="{ background: stop.color }" />
      </label>
      <input
        :value="Math.round(stop.position * 100)"
        type="range"
        min="0"
        max="100"
        step="1"
        class="banner-editor__range"
        @input="(e) => emit('setStopPosition', idx, Number((e.target as HTMLInputElement).value) / 100)"
      >
      <span class="banner-editor__range-value">{{ Math.round(stop.position * 100) }}%</span>
      <Tooltip>
        <Button
          size="s"
          variant="gray"
          square
          :disabled="stops.length <= 2"
          @click="emit('removeStop', idx)"
        >
          <Icon name="ph:x" />
        </Button>
        <template #tooltip>
          <p>Remove stop</p>
        </template>
      </Tooltip>
    </div>
  </div>
  <Flex y-center gap="s">
    <Button size="s" variant="gray" @click="emit('addStop')">
      <template #start>
        <Icon name="ph:plus" />
      </template>
      Add stop
    </Button>
  </Flex>
  <!-- Angle (linear + conic only) -->
  <Flex v-if="fillType !== 'radial'" y-center gap="s" expand>
    <span class="banner-editor__field-label">Angle</span>
    <input
      :value="angle"
      type="range"
      min="0"
      max="360"
      step="1"
      class="banner-editor__range"
      @input="(e) => { emit('update:angle', Number((e.target as HTMLInputElement).value)); redraw() }"
    >
    <span class="banner-editor__range-value">{{ angle }}&deg;</span>
  </Flex>
</template>
