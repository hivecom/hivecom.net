<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type { FillType, SelectOption, TextLayer } from './types'
import { Button, Color, Divider, Flex, Input, Select, Tooltip } from '@dolanske/vui'
import BannerGradientStops from './BannerGradientStops.vue'

defineProps<{
  layer: TextLayer
  fontOptions: SelectOption[]
  fontFamilyModel: SelectOption[] | undefined
  fontCustomMode: boolean
  fontFamilyCustom: string
  fontsLoaded: boolean
  fontsPermissionDenied: boolean
  fillTypeOptions: SelectOption<FillType>[]
  fillTypeModel: SelectOption<FillType>[] | undefined
  textFontSizeMin: number
  textFontSizeMax: number
  redraw: () => void
  addFillStop: () => void
  removeFillStop: (index: number) => void
  setFillStopColor: (index: number, color: string) => void
  setFillStopPosition: (index: number, position: number) => void
}>()

const emit = defineEmits<{
  'update:fontCustomMode': [value: boolean]
  'update:fontFamilyModel': [value: SelectOption[] | undefined]
  'update:fontFamilyCustom': [value: string]
  'update:fillTypeModel': [value: SelectOption<FillType>[] | undefined]
  'update:fillAngle': [value: number]
  'loadSystemFonts': []
}>()
</script>

<template>
  <div class="banner-editor__group">
    <span class="banner-editor__group-label">Text</span>
    <Flex column gap="xs">
      <Input
        v-model="layer.content"
        placeholder="Layer text…"
        expand
      />
      <!-- Font -->
      <Divider class="my-s" />
      <Flex y-center gap="xs" class="banner-editor__sub-label">
        <Icon name="ph:text-t" />
        <span>Font</span>
      </Flex>
      <!-- Font family row -->
      <Flex y-center gap="xs" expand>
        <Select
          v-if="!fontCustomMode"
          :model-value="fontFamilyModel"
          :options="fontOptions"
          single
          searchable
          expand
          placeholder="Font family…"
          @update:model-value="emit('update:fontFamilyModel', $event)"
        />
        <Input
          v-else
          :model-value="fontFamilyCustom"
          size="s"
          expand
          placeholder="e.g. Fira Code"
          spellcheck="false"
          @update:model-value="emit('update:fontFamilyCustom', String($event))"
        />
        <!-- Toggle custom entry -->
        <Tooltip>
          <Button
            size="m"
            variant="gray"
            square
            :outline="fontCustomMode"
            @click="emit('update:fontCustomMode', !fontCustomMode)"
          >
            <Icon name="ph:pencil-simple" />
          </Button>
          <template #tooltip>
            <p>{{ fontCustomMode ? 'Back to font list' : 'Enter font name manually' }}</p>
          </template>
        </Tooltip>
        <!-- Load system fonts (Chrome/Edge only) -->
        <Tooltip v-if="!fontsLoaded || fontsPermissionDenied">
          <Button
            size="s"
            variant="gray"
            square
            @click="emit('loadSystemFonts')"
          >
            <Icon name="ph:text-aa" />
          </Button>
          <template #tooltip>
            <p>{{ fontsPermissionDenied ? 'Permission denied - click to retry' : 'Load system fonts' }}</p>
          </template>
        </Tooltip>
      </Flex>
      <!-- Font size row -->
      <Flex y-center gap="s" expand>
        <input
          v-model.number="layer.fontSize"
          type="range"
          :min="textFontSizeMin"
          :max="textFontSizeMax"
          step="1"
          class="banner-editor__range"
          @input="redraw()"
        >
        <input
          class="banner-editor__num-input"
          type="number"
          :value="layer.fontSize"
          :min="textFontSizeMin"
          :max="textFontSizeMax"
          style="width: 56px; flex-shrink: 0;"
          @change="layer.fontSize = Number(($event.target as HTMLInputElement).value); redraw()"
        >
      </Flex>
      <!-- Fill -->
      <Divider class="my-s" />
      <Flex y-center gap="xs" class="banner-editor__sub-label">
        <Icon name="ph:paint-bucket" />
        <span>Fill</span>
      </Flex>
      <!-- Fill type + solid colour / gradient stops -->
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
          v-if="layer.fillType === 'solid'"
          v-model="layer.fillColor"
          size="s"
          expand
          @update:model-value="redraw()"
        />
        <!-- Gradient: preview bar -->
        <span
          v-else
          class="banner-editor__gradient-preview"
          :style="{
            background: `linear-gradient(90deg, ${layer.fillStops.map(s => `${s.color} ${s.position * 100}%`).join(', ')})`,
          }"
        />
      </Flex>

      <!-- Gradient stops (shown when fill is not solid) -->
      <template v-if="layer.fillType !== 'solid'">
        <BannerGradientStops
          :stops="layer.fillStops"
          :fill-type="layer.fillType"
          :angle="layer.fillAngle"
          :redraw="redraw"
          @add-stop="addFillStop"
          @remove-stop="removeFillStop"
          @set-stop-color="setFillStopColor"
          @set-stop-position="setFillStopPosition"
          @update:angle="emit('update:fillAngle', $event)"
        />
      </template>

      <!-- Style -->
      <Divider class="my-s" />
      <Flex y-center gap="xs" class="banner-editor__sub-label">
        <Icon name="ph:text-b" />
        <span>Style</span>
      </Flex>
      <Flex y-center gap="xs">
        <Tooltip>
          <Button
            square
            size="s"
            :variant="layer.bold ? 'fill' : 'gray'"
            @click="layer.bold = !layer.bold; redraw()"
          >
            <Icon name="ph:text-b" />
          </Button>
          <template #tooltip>
            <p>Bold</p>
          </template>
        </Tooltip>
        <Tooltip>
          <Button
            square
            size="s"
            :variant="layer.italic ? 'fill' : 'gray'"
            @click="layer.italic = !layer.italic; redraw()"
          >
            <Icon name="ph:text-italic" />
          </Button>
          <template #tooltip>
            <p>Italic</p>
          </template>
        </Tooltip>
        <Tooltip>
          <Button
            square
            size="s"
            :variant="layer.outline ? 'fill' : 'gray'"
            @click="layer.outline = !layer.outline; redraw()"
          >
            <Icon name="ph:selection-foreground" />
          </Button>
          <template #tooltip>
            <p>Outline</p>
          </template>
        </Tooltip>
        <Tooltip>
          <Button
            square
            size="s"
            :variant="layer.shadow ? 'fill' : 'gray'"
            @click="layer.shadow = !layer.shadow; redraw()"
          >
            <Icon name="ph:circle-half-tilt" />
          </Button>
          <template #tooltip>
            <p>Shadow</p>
          </template>
        </Tooltip>
      </Flex>

      <!-- Outline settings -->
      <template v-if="layer.outline">
        <Divider class="my-s" />
        <Flex y-center gap="xs" class="banner-editor__sub-label">
          <Icon name="ph:selection-foreground" />
          <span>Outline</span>
        </Flex>
        <Flex y-center gap="s" expand>
          <span class="banner-editor__field-label">Color</span>
          <Color
            v-model="layer.outlineColor"
            size="s"
            expand
            @update:model-value="redraw()"
          />
        </Flex>
        <Flex y-center gap="s" expand>
          <span class="banner-editor__field-label">Width</span>
          <input
            v-model.number="layer.outlineWidth"
            type="range"
            min="1"
            max="20"
            step="1"
            class="banner-editor__range"
            @input="redraw()"
          >
          <span class="banner-editor__range-value">{{ layer.outlineWidth }}px</span>
        </Flex>
      </template>

      <!-- Shadow settings -->
      <template v-if="layer.shadow">
        <Divider class="my-s" />
        <Flex y-center gap="xs" class="banner-editor__sub-label">
          <Icon name="ph:circle-half-tilt" />
          <span>Shadow</span>
        </Flex>
        <Flex y-center gap="s" expand>
          <span class="banner-editor__field-label">Color</span>
          <Color
            v-model="layer.shadowColor"
            size="s"
            expand
            @update:model-value="redraw()"
          />
        </Flex>
        <Flex y-center gap="s" expand>
          <span class="banner-editor__field-label">Blur</span>
          <input
            v-model.number="layer.shadowBlur"
            type="range"
            min="0"
            max="40"
            step="1"
            class="banner-editor__range"
            @input="redraw()"
          >
          <span class="banner-editor__range-value">{{ layer.shadowBlur }}px</span>
        </Flex>
        <Flex y-center gap="s" expand>
          <span class="banner-editor__field-label">X offset</span>
          <input
            v-model.number="layer.shadowOffsetX"
            type="range"
            min="-40"
            max="40"
            step="1"
            class="banner-editor__range"
            @input="redraw()"
          >
          <span class="banner-editor__range-value">{{ layer.shadowOffsetX }}px</span>
        </Flex>
        <Flex y-center gap="s" expand>
          <span class="banner-editor__field-label">Y offset</span>
          <input
            v-model.number="layer.shadowOffsetY"
            type="range"
            min="-40"
            max="40"
            step="1"
            class="banner-editor__range"
            @input="redraw()"
          >
          <span class="banner-editor__range-value">{{ layer.shadowOffsetY }}px</span>
        </Flex>
      </template>

      <!-- Transform -->
      <Divider class="my-s" />
      <Flex y-center gap="xs" class="banner-editor__sub-label">
        <Icon name="ph:arrows-out" />
        <span>Transform</span>
      </Flex>
      <!-- Rotation row -->
      <Flex y-center gap="s" expand>
        <span class="banner-editor__field-label">Rotate</span>
        <input
          v-model.number="layer.rotation"
          type="range"
          min="-180"
          max="180"
          step="1"
          class="banner-editor__range"
          @input="redraw()"
        >
        <span class="banner-editor__range-value">{{ layer.rotation }}°</span>
      </Flex>
      <!-- Opacity row -->
      <Flex y-center gap="s" expand>
        <span class="banner-editor__field-label">Opacity</span>
        <input
          v-model.number="layer.opacity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="banner-editor__range"
          @input="redraw()"
        >
        <span class="banner-editor__range-value">{{ Math.round(layer.opacity * 100) }}%</span>
      </Flex>
    </Flex>
  </div>
</template>
