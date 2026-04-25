<script setup lang="ts">
import { Avatar } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  url?: string | null
  size?: 's' | 'm' | 'l' | number
  alt?: string
}

const props = withDefaults(defineProps<Props>(), {
  url: null,
  size: 'm',
  alt: 'avatar',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isWebm = computed(() => {
  const url = props.url
  if (!url)
    return false
  return (url.split('?')[0] ?? '').endsWith('.webm')
})

function getSizePixels(size: 's' | 'm' | 'l' | number): string {
  if (typeof size === 'number')
    return `${size}px`
  switch (size) {
    case 's': return '28px'
    case 'm': return '40px'
    case 'l': return '48px'
  }
}

const sizePixels = computed(() => getSizePixels(props.size))
</script>

<template>
  <video
    v-if="isWebm"
    :key="url!"
    :src="url!"
    class="avatar-media__video"
    :style="{ width: sizePixels,
              height: sizePixels }"
    :aria-label="alt"
    autoplay
    loop
    muted
    playsinline
    @click="emit('click', $event)"
  />
  <Avatar
    v-else
    :key="url ?? undefined"
    :size="size"
    :url="url ?? undefined"
    :alt="alt"
    v-bind="$attrs"
    @click="emit('click', $event)"
  >
    <template v-if="$slots.default && !url" #default>
      <slot />
    </template>
  </Avatar>
</template>

<style lang="scss" scoped>
.avatar-media__video {
  border-radius: var(--border-radius-pill);
  object-fit: cover;
  display: block;
  flex-shrink: 0;
}
</style>
