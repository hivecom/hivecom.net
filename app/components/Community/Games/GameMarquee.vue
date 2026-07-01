<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { ref } from 'vue'
import GameCover from '@/components/Shared/GameCover.vue'
import Marquee from '@/components/Shared/Marquee.vue'

const props = withDefaults(defineProps<{
  games: Tables<'games'>[]
  speed?: number
  interactive?: boolean
  draggable?: boolean
}>(), {
  interactive: true,
  draggable: undefined,
})

const emit = defineEmits<{
  select: [gameId: number]
  click: []
}>()

const wasDragged = ref(false)

function onDragStart() {
  wasDragged.value = false
}

function onDragEnd(payload: { dragged: boolean }) {
  wasDragged.value = payload.dragged
}

function onGameClick(gameId: number) {
  if (wasDragged.value)
    return
  if (props.interactive)
    emit('select', gameId)
  else
    emit('click')
}
</script>

<template>
  <section
    class="marquee-section"
    :class="{
      'marquee-section--non-interactive': !props.interactive,
    }"
  >
    <Marquee
      direction="right"
      :speed="speed ?? 30"
      :pause-on-hover="interactive"
      :draggable="props.draggable ?? interactive"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
    >
      <div
        v-for="game in games"
        :key="game.id"
        class="marquee-item"
        :class="{ 'marquee-item--clickable': props.interactive }"
        @click="onGameClick(game.id)"
      >
        <GameCover :game="game" size="xl" aspect-ratio="card" :show-fallback="false" />
      </div>
    </Marquee>
  </section>
</template>

<style lang="scss" scoped>
.marquee-section {
  mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  height: 20rem;
  overflow: hidden;

  &--non-interactive:hover {
    .marquee-item :deep(.game-cover--ready) {
      filter: saturate(1);
      opacity: 1;
    }
  }
}

.marquee-item {
  height: 18rem;
  margin-top: var(--space-xs);
  margin-bottom: var(--space-xs);
  flex-shrink: 0;

  :deep(.game-cover-container) {
    height: 100%;
    width: auto;
    aspect-ratio: 2 / 2.8;
  }

  :deep(.game-cover) {
    height: 100%;
    object-fit: cover;
    border-radius: var(--border-radius-s);
    filter: saturate(0);
    opacity: 0;
    transition: var(--transition-slow);
  }

  // Fade up to the dim resting state once the image has actually loaded
  :deep(.game-cover--ready) {
    opacity: 0.5;
  }

  &--clickable {
    cursor: pointer;

    &:hover :deep(.game-cover--ready) {
      filter: saturate(1);
      opacity: 1;
    }
  }
}
</style>
