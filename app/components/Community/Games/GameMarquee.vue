<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Marquee } from '@dolanske/vui'
import { ref } from 'vue'
import GameCover from '@/components/Shared/GameCover.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'

const props = withDefaults(defineProps<{
  games: Tables<'games'>[]
  speed?: number
  interactive?: boolean
}>(), {
  interactive: true,
})

const emit = defineEmits<{
  select: [gameId: number]
}>()

const paused = ref(false)
</script>

<template>
  <section
    class="marquee-section"
    :class="{
      'marquee-section--paused': paused,
      'marquee-section--non-interactive': !props.interactive,
    }"
    @mouseenter="props.interactive ? (paused = true) : null"
    @mouseleave="paused = false"
  >
    <Marquee direction="left" :speed="speed ?? 30">
      <GlowGroup>
        <div
          v-for="game in games"
          :key="game.id"
          class="marquee-item"
          :class="{ 'marquee-item--clickable': props.interactive }"
          @click="props.interactive && emit('select', game.id)"
        >
          <GlowCard :no-glow="!props.interactive">
            <GameCover :game="game" size="xl" aspect-ratio="card" :show-fallback="false" />
          </GlowCard>
        </div>
      </GlowGroup>
    </Marquee>
  </section>
</template>

<style lang="scss" scoped>
.marquee-section {
  mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  height: 20rem;
  overflow: hidden;

  &--paused {
    :deep(.marquee-track) {
      animation-play-state: paused;
    }
  }

  &--non-interactive:hover {
    .marquee-item :deep(.game-cover) {
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
    opacity: 0.5;
    transition: var(--transition-slow);
  }

  &--clickable {
    cursor: pointer;

    :deep(.glow-card:hover .game-cover),
    &:hover :deep(.game-cover) {
      filter: saturate(1);
      opacity: 1;
    }
  }
}
</style>
