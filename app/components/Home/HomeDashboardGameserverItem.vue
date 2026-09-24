<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import { computed } from 'vue'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import { buildConnectContext } from '@/composables/useGameConnect'

// The connect button stops the click so launching doesn't also navigate. It hides
// behind the meta line until hover, since activity is what you scan a list for.
const props = defineProps<{
  gs: GameserverWithContainer
  game?: Tables<'games'> | null
  /** Swapped for the connect button on hover */
  meta?: string
}>()

const connect = computed(() => buildConnectContext(props.game, props.gs))

// Without an address there's nothing to reveal, so the activity line stays on hover
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

// One shared cell, so swapping on hover doesn't shift the name
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

  // No hover on touch, so keep showing the activity
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
