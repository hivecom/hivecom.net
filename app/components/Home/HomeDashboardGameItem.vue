<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, useSlots } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'

// One game in the Games card. When the Steam app matches a game we track, the
// row opens the same details modal the games page uses, so a name on the
// dashboard behaves like a name anywhere else. Games we have no row for stay
// plain text rather than a button that leads nowhere.
const props = withDefaults(defineProps<{
  name: string
  /** Our games table id, or null when the Steam app isn't one we track. */
  gameId?: number | null
  /** Right-hand line on inline rows, second line on grid tiles. */
  meta?: string
  /** Profile ids in this game right now, drawn as the same avatar cluster the
   *  games page uses on its cards. */
  players?: string[]
  /** Subset of players that are mutual friends, which puts them first in the
   *  cluster so a cut-off list keeps them. */
  friendIds?: string[]
  inline?: boolean
}>(), {
  players: () => [],
  friendIds: () => [],
})

const emit = defineEmits<{ open: [gameId: number] }>()

const slots = useSlots()

// A row that carries its own links (the avatars of who's playing) can't be a
// button, so there the name takes the click on its own.
const hasOwnContent = computed(() => slots.default !== undefined || props.players.length > 0)
const clickable = computed(() => props.gameId != null)
const rootIsButton = computed(() => clickable.value && !hasOwnContent.value)

function open(): void {
  if (props.gameId != null)
    emit('open', props.gameId)
}
</script>

<template>
  <component
    :is="rootIsButton ? 'button' : 'div'"
    class="home-item"
    :class="{ inline,
              'home-game-item--clickable': rootIsButton }"
    :type="rootIsButton ? 'button' : undefined"
    @click="rootIsButton && open()"
  >
    <button
      v-if="clickable && hasOwnContent"
      type="button"
      class="home-game-item__name"
      @click="open"
    >
      <strong>{{ name }}</strong>
    </button>
    <strong v-else>{{ name }}</strong>

    <slot>
      <Flex
        v-if="meta || players.length"
        y-center
        gap="s"
        :expand="!inline"
        :x-between="!inline"
        class="home-game-item__foot"
      >
        <span v-if="meta">{{ meta }}</span>

        <BulkAvatarDisplay
          v-if="players.length"
          :user-ids="players"
          :friend-ids="friendIds"
          :max-users="4"
          :avatar-size="18"
          :show-names="false"
          :expand="false"
          cluster
          no-empty-state
        />
      </Flex>
    </slot>
  </component>
</template>

<style scoped lang="scss">
// The row is a button for the games we can open, so it needs the button
// defaults stripped back to what .home-item already draws.
.home-game-item--clickable {
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.home-game-item__name {
  display: block;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

// Tiles put the meta line and the avatars on one line under the name, so the
// avatars sit at the right edge with the timestamp on the left.
.home-game-item__foot {
  flex-shrink: 0;
}
</style>
