<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import { computed, useSlots } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'

// One game in the Games card. When the Steam app matches a game we track, the
// row opens the same details modal the games page uses, so a name on the
// dashboard behaves like a name anywhere else. Games we have no row for stay
// plain text rather than a button that leads nowhere.
const props = withDefaults(defineProps<{
  name: string
  /** Our games table id, or null when the Steam app isn't one we track. */
  gameId?: number | null
  /** Our games row, when the row should lead with the game's icon. */
  game?: Tables<'games'> | null
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

const clickable = computed(() => props.gameId != null)
const hasSlot = computed(() => slots.default !== undefined)

// The row itself is the button when nothing inside it is a link. Player avatars
// link to profiles, so those rows hand the click to the name and stretch its hit
// area over the whole row instead, with the avatars lifted back on top. Slotted
// content isn't ours to lift, so it keeps the plain name-only click.
const rootIsButton = computed(() => clickable.value && !hasSlot.value && props.players.length === 0)
const stretched = computed(() => clickable.value && !hasSlot.value && props.players.length > 0)
const nameIsButton = computed(() => clickable.value && !rootIsButton.value)

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
              'home-game-item--clickable': rootIsButton,
              'home-game-item--stretched': stretched }"
    :type="rootIsButton ? 'button' : undefined"
    @click="rootIsButton && open()"
  >
    <Flex y-center gap="s" class="home-game-item__lead">
      <GameIcon v-if="game" :game="game" size="s" />

      <button
        v-if="nameIsButton"
        type="button"
        class="home-game-item__name"
        @click="open"
      >
        <strong>{{ name }}</strong>
      </button>
      <strong v-else>{{ name }}</strong>
    </Flex>

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
          class="home-game-item__players"
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

// Rows we can't make a button still open from anywhere: the name's click target
// stretches over the whole row behind the content, and the avatars sit above it
// so their profile links still work.
.home-game-item--stretched {
  position: relative;

  .home-game-item__name::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .home-game-item__players {
    position: relative;
    z-index: 1;
  }
}

// The icon and the name share the left of the row, and the group has to be
// allowed to shrink or a long name pushes the meta line off the end.
.home-game-item__lead {
  min-width: 0;
}

// Tiles put the meta line and the avatars on one line under the name, so the
// avatars sit at the right edge with the timestamp on the left.
.home-game-item__foot {
  flex-shrink: 0;
}
</style>
