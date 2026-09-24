<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { Tables } from '@/types/database.overrides'
import { Flex, Sheet } from '@dolanske/vui'
import HomeDashboardGameserverItem from '@/components/Home/HomeDashboardGameserverItem.vue'

// The card's rows without the one-per-game cut. Short enough to render whole.
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
