<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { Tables } from '@/types/database.overrides'
import { Flex, Sheet } from '@dolanske/vui'
import HomeDashboardGameserverItem from '@/components/Home/HomeDashboardGameserverItem.vue'

// Every server we host, opened from the one-per-game rows the gameservers card
// has room for. Same rows and same order as the card (busiest now, then most
// recently busy), just without the one-per-game cut, so a game with three
// servers finally shows all three. The list is short enough to render whole.
export interface GameserverSheetRow {
  gs: GameserverWithContainer
  game: Tables<'games'> | null
  meta: string
}

defineProps<{
  open: boolean
  servers: GameserverSheetRow[]
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Sheet :open="open" :size="456" @close="emit('close')">
    <template #header>
      <h4>Gameservers</h4>
    </template>

    <Flex column gap="xs" class="pt-s">
      <HomeDashboardGameserverItem
        v-for="row in servers"
        :key="row.gs.id"
        :gs="row.gs"
        :game="row.game"
        :meta="row.meta"
      />

      <p v-if="!servers.length" class="text-s text-color-lighter">
        No servers configured yet.
      </p>
    </Flex>
  </Sheet>
</template>
