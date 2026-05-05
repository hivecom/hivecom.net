<script setup lang="ts">
import type { MetricsServerDetailMinecraft } from '@/types/metrics'
import { Badge, Button, Card, Flex, Grid, Modal } from '@dolanske/vui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getCSSVariable } from '@/lib/utils/common'
import TinyBadge from '../Shared/TinyBadge.vue'

interface Props {
  id: number
}

const props = defineProps<Props>()

const { metrics, fetchMetrics, fetchMetricsForServer } = useDataMetrics()
const { gameservers } = useDataGameservers()

const data = shallowRef<number[]>([])
const history = shallowRef<{ capturedAt: string, players: number | null }[]>([])
const showModal = ref(false)

const serverName = computed(() => {
  const gs = gameservers.value.find(g => g.id === props.id)
  return gs?.name ?? 'Game Server Activity'
})

const currentPlayerCount = computed<number | null>(() => {
  const count = metrics.value?.gameservers.byServer[String(props.id)]?.data?.players
  return count ?? null
})

const minecraftDetail = computed<MetricsServerDetailMinecraft | null>(() => {
  const detail = metrics.value?.gameservers.byServer[String(props.id)]
  if (detail?.protocol === 'minecraft')
    return detail
  return null
})

const playerList = computed<string[]>(() => minecraftDetail.value?.data?.playerList ?? [])
const showPlayerList = ref(false)

const badgeVariant = computed(() => currentPlayerCount.value != null && currentPlayerCount.value > 0 ? 'success' : 'neutral')

const isMobile = useBreakpoint('<xs')
const accentColor = computed(() => getCSSVariable('--color-accent'))

onMounted(async () => {
  if (metrics.value === null)
    fetchMetrics()

  const serverHistory = await fetchMetricsForServer(props.id, 14)
  history.value = serverHistory
  data.value = serverHistory.map(e => e.players ?? 0)
})

function tooltipLabel(index: number, value: number): string {
  const entry = history.value[index]
  const suffix = `${value} player${value === 1 ? '' : 's'}`
  if (!entry)
    return suffix

  const now = Date.now()
  const then = new Date(entry.capturedAt).getTime()
  const diffDays = Math.round((now - then) / (1000 * 60 * 60 * 24))

  if (diffDays === 0)
    return `${suffix} - today`
  if (diffDays === 1)
    return `${suffix} - yesterday`
  return `${suffix} - ${diffDays} days ago`
}
</script>

<template>
  <Card>
    <Flex :x-between="!isMobile" y-center :gap="isMobile ? 's' : undefined">
      <Flex v-if="currentPlayerCount !== null" :gap="0" y-center>
        <TinyBadge v-if="isMobile" :variant="badgeVariant" class="px-1" @click="showPlayerList = !!(minecraftDetail && playerList.length > 0)">
          <Icon name="ph:circle-fill" />
          {{ currentPlayerCount }}
        </TinyBadge>
        <Badge v-else :variant="badgeVariant">
          <Icon name="ph:circle-fill" />
          {{ currentPlayerCount }} Online Now
        </Badge>
        <template v-if="!isMobile && minecraftDetail && playerList.length > 0">
          <Button variant="link" @click="showPlayerList = true">
            <Icon name="ph:users" class="text-color-accent" />
          </Button>
        </template>
      </Flex>

      <ChartActivityHistogram :data :height="32" :expand="isMobile" clickable @click="showModal = true">
        <template #tooltip="{ value, index }">
          <p>{{ tooltipLabel(index, value) }}</p>
        </template>
      </ChartActivityHistogram>
    </Flex>
  </Card>

  <Modal :open="showPlayerList" size="s" centered :card="{ separators: true }" @close="showPlayerList = false">
    <template #header>
      <h4>Online Players</h4>
    </template>
    <Grid :columns="2" gap="s">
      <Card v-for="player in playerList" :key="player" class="player-card">
        <Flex y-center gap="s">
          <Icon name="ph:user" />
          <span>{{ player }}</span>
        </Flex>
      </Card>
    </Grid>
    <template #footer="{ close }">
      <Flex x-end expand>
        <Button variant="gray" @click="close">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>

  <ChartActivityHistogramModal
    v-model:open="showModal"
    :title="serverName"
    :series="['gameserversPlayers']"
    :color="accentColor"
  >
    <template #default="{ period, window, utc, color }">
      <ChartGameserversPlayers :period :window :utc :server-id="props.id" :color />
    </template>
  </ChartActivityHistogramModal>
</template>

<style lang="scss" scoped>
</style>
