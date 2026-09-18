<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import { computed } from 'vue'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import { buildConnectContext } from '@/composables/useGameConnect'

// One server as a row in the Gameservers card. The row is the link to the
// server's page; the connect button rides on the right and stops the click so
// launching doesn't also navigate. With a meta line the button hides behind it
// until hover, since the activity is what you scan a list for. Without one
// (the hop-in pick) the button is the point, so it stays out.
const props = defineProps<{
  gs: GameserverWithContainer
  game?: Tables<'games'> | null
  /** Right-hand line, swapped for the connect button on hover. */
  meta?: string
}>()

const connect = computed(() => buildConnectContext(props.game, props.gs))

// With no address there is no connect action to reveal, so the row keeps
// showing its activity line on hover rather than fading into nothing.
const hasConnect = computed(() => (props.gs.addresses?.length ?? 0) > 0)
</script>

<template>
  <NuxtLink
    :to="`/servers/gameservers/${gs.id}`"
    class="home-item inline home-gameserver"
    :class="{ 'home-gameserver--reveal': meta !== undefined && hasConnect }"
  >
    <Flex y-center gap="s" class="home-gameserver__name">
      <GameIcon v-if="game" :game="game" size="s" />
      <strong>{{ gs.name }}</strong>
    </Flex>

    <div class="home-gameserver__action">
      <span v-if="meta !== undefined" class="home-gameserver__activity">{{ meta }}</span>

      <GameServerConnectButton
        v-if="hasConnect"
        class="home-gameserver__connect"
        :addresses="gs.addresses"
        :port="gs.port"
        :connect="connect"
        size="s"
        variant="gray"
        plain
        stop-propagation
      />
    </div>
  </NuxtLink>
</template>

<style scoped lang="scss">
.home-gameserver__name {
  min-width: 0;
}

// The activity line and the launch button share one cell, so the row is sized
// for the wider of the two and swapping them on hover doesn't shift the name.
.home-gameserver__action {
  display: grid;
  flex-shrink: 0;

  > * {
    grid-area: 1 / 1;
    align-self: center;
    justify-self: end;
  }
}

.home-gameserver__activity {
  transition: opacity var(--transition-duration) ease;
  white-space: nowrap;
}

// Only a row with a meta line hides its button. The swap runs on hover and on
// keyboard focus landing inside the row.
.home-gameserver--reveal {
  .home-gameserver__connect {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-duration) ease;
  }

  &:hover,
  &:focus-within {
    .home-gameserver__connect {
      opacity: 1;
      pointer-events: auto;
    }

    .home-gameserver__activity {
      opacity: 0;
    }
  }

  // No hover to reveal on touch, so the row keeps showing what it knows.
  @media (hover: none) {
    .home-gameserver__connect {
      display: none;
    }

    &:hover .home-gameserver__activity {
      opacity: 1;
    }
  }
}
</style>
