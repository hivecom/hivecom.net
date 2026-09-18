<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { onMounted, ref, watch } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import { useDataGameAssets } from '@/composables/useDataGameAssets'

// A game as artwork rather than a row, for the surfaces that want a game to
// read as a cover at a glance instead of as one more line in a list. Opens the
// same details modal every other game name on the site does, unless it's been
// given a title and route of its own, which is how a gameserver borrows the art
// of the game it runs.
const props = withDefaults(defineProps<{
  game: Tables<'games'>
  /** Line under the title. */
  meta?: string
  /** Overrides the game name as the tile's title, for a tile that stands for a
   * server running the game rather than for the game itself. */
  title?: string
  /** Route the title leads to. When set the title is a link instead of a button
   * that emits `open`. */
  to?: string
  /** Profile ids in this game right now, drawn as an avatar cluster. */
  players?: string[]
  /** Subset of players that are mutual friends, so a cut-off cluster keeps them. */
  friendIds?: string[]
}>(), {
  players: () => [],
  friendIds: () => [],
})

const emit = defineEmits<{ open: [gameId: number] }>()

const { getGameBackgroundUrl, getGameCoverUrl } = useDataGameAssets()

const artUrl = ref<string | null>(null)
const artReady = ref(false)

// Incremented per load so a slower earlier lookup can't overwrite a newer one.
let loadToken = 0

async function loadArt(): Promise<void> {
  const token = ++loadToken

  // Background first: it's the wide asset, so it crops to a banner without
  // losing the middle of the image the way a portrait cover does.
  let url = await getGameBackgroundUrl(props.game)
  if (url === null)
    url = await getGameCoverUrl(props.game)

  if (token !== loadToken)
    return

  // Same URL means the <img> never fires load again, so keep what we have.
  if (url !== artUrl.value)
    artReady.value = false

  artUrl.value = url
}

onMounted(loadArt)

// Identity rather than the object: a list refetch hands us a fresh reference
// for the same game and shouldn't restart the lookup.
watch(() => [props.game.id, props.game.shorthand], loadArt)

function onError(): void {
  artUrl.value = null
  artReady.value = false
}
</script>

<template>
  <div class="game-art-card">
    <img
      v-if="artUrl"
      :src="artUrl"
      class="game-art-card__art"
      :class="{ 'game-art-card__art--ready': artReady }"
      alt=""
      draggable="false"
      @load="artReady = true"
      @error="onError"
    >

    <!-- Out of the body and into the corner, so who's in the game reads before
         the title does and never fights the meta line for the bottom row. -->
    <BulkAvatarDisplay
      v-if="players.length"
      class="game-art-card__players"
      :user-ids="players"
      :friend-ids="friendIds"
      :max-users="4"
      :avatar-size="18"
      :show-names="false"
      :expand="false"
      cluster
      no-empty-state
    />

    <div class="game-art-card__body">
      <!-- The name carries the click and stretches over the whole card, so the
           avatars stay real profile links instead of being swallowed by an
           outer button. A tile with a route navigates instead of opening the
           details modal, but it stretches the same way. -->
      <NuxtLink v-if="to" :to class="game-art-card__name">
        <strong>{{ title ?? game.name }}</strong>
      </NuxtLink>

      <button v-else type="button" class="game-art-card__name" @click="emit('open', game.id)">
        <strong>{{ title ?? game.name }}</strong>
      </button>

      <span v-if="meta" class="game-art-card__meta">{{ meta }}</span>
    </div>

    <!-- Corner action, lifted above the stretched link the same way the avatars
         are. It shares that corner with them, so a tile passes one or the other. -->
    <div v-if="$slots.action" class="game-art-card__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.game-art-card {
  position: relative;
  display: flex;
  // Fills whatever slot it's handed. A grid stretches it for free, but VUI's
  // Flex aligns children to the start, so a column of these needs to be told.
  width: 100%;
  min-width: 0;
  min-height: 108px;
  overflow: hidden;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border-weak);
  background-color: var(--color-bg-medium);
  transition: border-color var(--transition-duration) ease;

  &:hover {
    border-color: var(--color-border);

    .game-art-card__art--ready {
      opacity: 0.55;
      filter: grayscale(0);
      scale: 1.04;
    }
  }
}

// Sits under the card's own background rather than over it, so the text on top
// keeps the ordinary theme colours every other item on the dashboard uses. Grey
// and faint at rest so a row of these doesn't shout over the rest of the page,
// with the colour coming back under the cursor.
.game-art-card__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  scale: 1.01;
  pointer-events: none;
  transition:
    opacity var(--transition-slow-duration) ease,
    filter var(--transition-slow-duration) ease,
    scale var(--transition-slow-duration) ease;

  &--ready {
    opacity: 0.3;
    filter: grayscale(1);
  }
}

// The art comes back to full colour under the cursor, which is exactly when the
// title has the busiest thing to sit on. Scrimming the bottom of the card keeps
// the name readable without having to dull the artwork to get there.
.game-art-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--color-bg-medium) 92%, transparent) 0%,
    color-mix(in srgb, var(--color-bg-medium) 70%, transparent) 40%,
    transparent 80%
  );
}

.game-art-card__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-xxs);
  width: 100%;
  min-width: 0;
  padding: var(--space-s);
}

.game-art-card__name {
  display: block;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;

  // Click target covers the card. It's positioned, so it wins the hit test over
  // the plain text under it, and the avatars lift themselves back above it.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  strong {
    display: block;
    font-size: var(--font-size-m);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }
}

.game-art-card__meta {
  position: relative;
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
}

.game-art-card__players,
.game-art-card__action {
  position: absolute;
  top: var(--space-s);
  right: var(--space-s);
  z-index: 2;
}
</style>
