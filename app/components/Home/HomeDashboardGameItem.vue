<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import { computed, useSlots } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'

// Untracked games stay plain text rather than a button that leads nowhere
const props = withDefaults(defineProps<{
  name: string
  /** Null when the Steam app isn't one we track */
  gameId?: number | null
  /** Set when the row should lead with the game's icon */
  game?: Tables<'games'> | null
  /** Right-hand line on inline rows, second line on grid tiles */
  meta?: string
  /** Profile ids in this game right now */
  players?: string[]
  /** Mutual friends go first, so a cut-off cluster keeps them */
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

// Avatars link to profiles, so rows with players stretch the name's click over the
// row instead of being a button. Slotted content isn't ours to lift, so it stays name-only.
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
// Strips the button defaults back to what .home-item draws
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

// The avatars sit above the stretched click so their profile links still work
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

// Must shrink, or a long name pushes the meta line off the end. The min height
// keeps these level with gameserver rows and their connect button.
.home-game-item__lead {
  min-width: 0;
  min-height: var(--interactive-el-height-s);
}

.home-game-item__foot {
  flex-shrink: 0;
}
</style>
