<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Card, Flex, Indicator } from '@dolanske/vui'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'

const props = defineProps<{
  game: Tables<'games'>
  live: boolean
  playerIds?: string[]
  lastSeen?: number
  peakCount?: number
}>()

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 60)
    return `${mins}m ago`
  if (hours < 24)
    return `${hours}h ago`
  return `${days}d ago`
}

const subtitle = computed(() => {
  if (props.live) {
    const count = props.playerIds?.length ?? 0
    return count === 1 ? '1 playing now' : `${count} playing now`
  }
  const time = props.lastSeen != null ? timeAgo(props.lastSeen) : ''
  const people = props.peakCount === 1 ? '1 person' : `${props.peakCount ?? 0} people`
  return `${time} - ${people}`
})
</script>

<template>
  <GameDetailsModalTrigger v-slot="{ open }" :game-id="game.id">
    <Card class="recent-game-activity-tile" @click="open">
      <Flex column gap="xs" class="recent-game-activity-tile__inner">
        <!-- Game name + indicator row -->
        <Flex y-center expand x-between gap="xs" class="recent-game-activity-tile__title">
          <Flex y-center gap="xs">
            <GameIcon :game="game" size="s" />
            <span class="text-s text-bold recent-game-activity-tile__name">{{ game.name }}</span>
          </Flex>
          <div style="height: 8px">
            <Indicator v-if="live" variant="online" outline ripple />
          </div>
        </Flex>

        <!-- Subtitle row -->
        <span class="text-xxs text-color-lighter recent-game-activity-tile__meta">
          {{ subtitle }}
        </span>
      </Flex>
    </Card>
  </GameDetailsModalTrigger>
</template>

<style lang="scss" scoped>
.recent-game-activity-tile {
  cursor: pointer;
  height: 100%;
  position: relative;

  :deep(.vui-card-content) {
    height: 100%;
  }
}

.recent-game-activity-tile__inner {
  height: 100%;
}

.recent-game-activity-tile__title {
  min-width: 0;
  flex: 1 1 auto;
}

.recent-game-activity-tile__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.recent-game-activity-tile__meta {
  line-height: 1.3;
}
</style>
