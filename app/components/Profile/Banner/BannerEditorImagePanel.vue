<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type { ImageLayer } from './types'
import { Button, Flex } from '@dolanske/vui'

defineProps<{
  layer: ImageLayer
  redraw: () => void
  setImageX: (layer: ImageLayer, value: string) => void
  setImageY: (layer: ImageLayer, value: string) => void
  setImageWidth: (layer: ImageLayer, value: string) => void
  setImageHeight: (layer: ImageLayer, value: string) => void
}>()

const emit = defineEmits<{
  replaceImage: [layerId: string]
  remove: [layerId: string]
}>()
</script>

<template>
  <div class="banner-editor__group">
    <span class="banner-editor__group-label">Image</span>
    <Flex column gap="s">
      <p class="banner-editor__hint">
        Drag to move &middot; drag corner to resize &middot; hold Shift to ignore aspect ratio
      </p>

      <!-- Rotation -->
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
        <span class="banner-editor__range-value">{{ layer.rotation }}&deg;</span>
      </Flex>

      <!-- Position -->
      <div class="banner-editor__transform-grid">
        <span class="banner-editor__field-label">X</span>
        <input
          class="banner-editor__num-input"
          type="number"
          :value="layer.x"
          @change="setImageX(layer, ($event.target as HTMLInputElement).value)"
        >
        <span class="banner-editor__field-label">Y</span>
        <input
          class="banner-editor__num-input"
          type="number"
          :value="layer.y"
          @change="setImageY(layer, ($event.target as HTMLInputElement).value)"
        >
      </div>

      <!-- Size (aspect-locked) -->
      <div class="banner-editor__transform-grid">
        <span class="banner-editor__field-label">W</span>
        <input
          class="banner-editor__num-input"
          type="number"
          min="4"
          :value="layer.width"
          @change="setImageWidth(layer, ($event.target as HTMLInputElement).value)"
        >
        <span class="banner-editor__field-label">H</span>
        <input
          class="banner-editor__num-input"
          type="number"
          min="4"
          :value="layer.height"
          @change="setImageHeight(layer, ($event.target as HTMLInputElement).value)"
        >
      </div>

      <template v-if="!layer.src">
        <p class="banner-editor__hint">
          Image file missing. Replace to restore.
        </p>
        <p v-if="layer.assetMeta.folderRelativePath" class="banner-editor__hint banner-editor__hint--path">
          <Icon name="ph:folder" style="vertical-align: -2px; margin-right: 2px;" />
          {{ layer.assetMeta.folderName }}/{{ layer.assetMeta.folderRelativePath }}
        </p>
      </template>

      <Flex y-center gap="s" expand>
        <Button size="s" variant="gray" @click="emit('replaceImage', layer.id)">
          <template #start>
            <Icon name="ph:image" />
          </template>
          Replace image
        </Button>
        <Button size="s" variant="danger" @click="emit('remove', layer.id)">
          <template #start>
            <Icon name="ph:trash" />
          </template>
          Remove
        </Button>
      </Flex>
    </Flex>
  </div>
</template>
