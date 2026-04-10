<script setup lang="ts">
import type { BannerLayer } from './types'
import { Button, Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  layersReversed: BannerLayer[]
  selectedLayerId: string | null
}>()

const emit = defineEmits<{
  addText: []
  addImage: []
  select: [id: string]
  moveUp: [id: string]
  moveDown: [id: string]
  duplicate: [id: string]
  remove: [id: string]
}>()
</script>

<template>
  <div class="banner-editor__group">
    <span class="banner-editor__group-label">Layers</span>
    <Flex column gap="s">
      <Flex y-center gap="xs">
        <Button size="s" variant="gray" @click="emit('addText')">
          <template #start>
            <Icon name="ph:text-t" />
          </template>
          Add text
        </Button>
        <Button size="s" variant="gray" @click="emit('addImage')">
          <template #start>
            <Icon name="ph:image" />
          </template>
          Add image
        </Button>
      </Flex>
      <div v-if="layersReversed.length > 0" class="banner-editor__layers">
        <div
          v-for="(layer, index) in layersReversed"
          :key="layer.id"
          class="banner-editor__layer-item"
          :class="{ 'banner-editor__layer-item--selected': layer.id === selectedLayerId }"
          @click="emit('select', layer.id)"
        >
          <div class="banner-editor__layer-actions">
            <Tooltip>
              <Button
                square
                size="s"
                variant="gray"
                :disabled="index === 0"
                @click.stop="emit('moveUp', layer.id)"
              >
                <Icon name="ph:arrow-up" />
              </Button>
              <template #tooltip>
                <p>Move forward</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button
                square
                size="s"
                variant="gray"
                :disabled="index === layersReversed.length - 1"
                @click.stop="emit('moveDown', layer.id)"
              >
                <Icon name="ph:arrow-down" />
              </Button>
              <template #tooltip>
                <p>Move backward</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button
                square
                size="s"
                variant="gray"
                @click.stop="emit('duplicate', layer.id)"
              >
                <Icon name="ph:copy" />
              </Button>
              <template #tooltip>
                <p>Duplicate layer</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button
                square
                size="s"
                variant="danger"
                plain
                @click.stop="emit('remove', layer.id)"
              >
                <Icon name="ph:trash" />
              </Button>
              <template #tooltip>
                <p>Remove layer</p>
              </template>
            </Tooltip>
          </div>
          <span class="banner-editor__layer-icon">
            <Icon :name="layer.type === 'text' ? 'ph:text-t' : 'ph:image'" />
          </span>
          <span class="banner-editor__layer-label">
            <template v-if="layer.type === 'text'">
              {{ layer.content || '(empty)' }}
            </template>
            <template v-else>
              {{ layer.file?.name ?? layer.assetMeta?.originalName ?? 'Image' }}
            </template>
          </span>
        </div>
      </div>
    </Flex>
  </div>
</template>
