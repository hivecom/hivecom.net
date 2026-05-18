<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Flex, Modal } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import GameServerRow from '@/components/GameServers/GameServerRow.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

type GameserverWithContainer = Tables<'network_gameservers'> & {
  container?: (Tables<'network_containers'> & {
    server?: {
      docker_control?: boolean | null
      accessible?: boolean | null
    } | null
  }) | null
}

interface Props {
  game: Tables<'games'> | null
  gameservers: GameserverWithContainer[]
  open: boolean
}

defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const isBelowSmall = useBreakpoint('<xs')
</script>

<template>
  <Modal
    v-if="open" :open="open" :size="isBelowSmall ? 'screen' : undefined" :card="{ separators: true }"
    @close="emit('close')"
  >
    <template v-if="game" #header>
      <Flex gap="s" y-center expand>
        <GameIcon :game="game" size="m" />
        <Flex y-center gap="s" expand x-between>
          <h3>{{ game.name }}</h3>
        </Flex>
      </Flex>
    </template>

    <div class="modal-content">
      <div v-if="gameservers.length > 0" class="servers-list">
        <GameServerRow
          v-for="gameserver in gameservers" :key="gameserver.id"
          :gameserver="gameserver"
          :container="gameserver.container ?? null"
          :game="game"
          compact
        />
      </div>

      <Alert v-else variant="info">
        No servers available for this game.
      </Alert>
    </div>

    <template #footer>
      <Flex x-end gap="s" expand>
        <Button :expand="isBelowSmall" @click="emit('close')">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.modal-content {
  .servers-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
}
</style>
