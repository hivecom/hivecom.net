<script setup lang="ts">
import type { FillType, GradientStop, SelectOption } from './types'
import { Button, Color, Flex, Select, Tooltip } from '@dolanske/vui'
import BannerGradientStops from './BannerGradientStops.vue'

defineProps<{
  fillType: FillType
  fillColor: string
  fillStops: GradientStop[]
  fillAngle: number
  border: boolean
  borderColor: string
  fillTypeOptions: SelectOption<FillType>[]
  fillTypeModel: SelectOption<FillType>[] | undefined
  redraw: () => void
  addStop: () => void
  removeStop: (index: number) => void
  setStopColor: (index: number, color: string) => void
  setStopPosition: (index: number, position: number) => void
}>()

const emit = defineEmits<{
  'update:fillColor': [value: string]
  'update:fillAngle': [value: number]
  'update:border': [value: boolean]
  'update:borderColor': [value: string]
  'update:fillTypeModel': [value: SelectOption<FillType>[] | undefined]
}>()
</script>

<template>
  <div class="banner-editor__group">
    <span class="banner-editor__group-label">Background</span>
    <Flex column gap="xs" expand>
      <Flex y-center gap="xs">
        <Select
          :model-value="fillTypeModel"
          :options="fillTypeOptions"
          single
          expand
          @update:model-value="emit('update:fillTypeModel', $event)"
        />
        <!-- Solid: single colour swatch -->
        <Color
          v-if="fillType === 'solid'"
          :model-value="fillColor"
          size="s"
          expand
          @update:model-value="emit('update:fillColor', $event); redraw()"
        />
        <!-- Gradient: preview bar -->
        <span
          v-else
          class="banner-editor__gradient-preview"
          :style="{
            background: `linear-gradient(90deg, ${fillStops.map(s => `${s.color} ${s.position * 100}%`).join(', ')})`,
          }"
        />
      </Flex>

      <!-- Gradient stops -->
      <template v-if="fillType !== 'solid'">
        <BannerGradientStops
          :stops="fillStops"
          :fill-type="fillType"
          :angle="fillAngle"
          :redraw="redraw"
          @add-stop="addStop"
          @remove-stop="removeStop"
          @set-stop-color="setStopColor"
          @set-stop-position="setStopPosition"
          @update:angle="emit('update:fillAngle', $event)"
        />
      </template>

      <!-- Border -->
      <Flex y-center gap="xs" expand>
        <Tooltip>
          <Button
            square
            size="s"
            :variant="border ? 'fill' : 'gray'"
            @click="emit('update:border', !border); redraw()"
          >
            <Icon name="ph:frame-corners" />
          </Button>
          <template #tooltip>
            <p>Border</p>
          </template>
        </Tooltip>
        <Color
          :model-value="borderColor"
          size="s"
          expand
          :disabled="!border"
          @update:model-value="emit('update:borderColor', $event); redraw()"
        />
      </Flex>
    </Flex>
  </div>
</template>
