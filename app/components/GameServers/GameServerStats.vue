<script setup lang="ts">
import type { MetricsServerDetailMinecraft, MetricsServerDetailSource, SourcePlayer } from '@/types/metrics'
import { Badge, Button, Card, Flex, Grid, Modal } from '@dolanske/vui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getCSSVariable } from '@/lib/utils/common'

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
  const detail = metrics.value?.gameservers.byServer[String(props.id)]
  if (!detail?.data)
    return null
  if (detail.protocol === 'minecraft')
    return detail.data.numPlayers ?? null
  return detail.data.players ?? null
})

const minecraftDetail = computed<MetricsServerDetailMinecraft | null>(() => {
  const detail = metrics.value?.gameservers.byServer[String(props.id)]
  if (detail?.protocol === 'minecraft')
    return detail
  return null
})

const sourceDetail = computed<MetricsServerDetailSource | null>(() => {
  const detail = metrics.value?.gameservers.byServer[String(props.id)]
  if (detail?.protocol === 'source')
    return detail
  return null
})

// Unified player list: Minecraft gives string[], source gives SourcePlayer[]
// Normalize both to { name: string, detail?: string }
interface PlayerEntry {
  name: string
  detail?: string
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  if (h > 0)
    return `${h}h ${m % 60}m`
  return `${m}m`
}

const playerList = computed<PlayerEntry[]>(() => {
  if (minecraftDetail.value?.data?.players?.length) {
    return minecraftDetail.value.data.players.map(name => ({ name }))
  }
  if (sourceDetail.value?.data?.playerList?.length) {
    const collectedAt = metrics.value?.collectedAt
    const extrapolatedSeconds = collectedAt
      ? (Date.now() - new Date(collectedAt).getTime()) / 1000
      : 0
    return (sourceDetail.value.data.playerList as SourcePlayer[]).map(p => ({
      name: p.name,
      detail: `Score: ${p.score} - ${formatDuration(p.duration + extrapolatedSeconds)}`,
    }))
  }
  return []
})

const hasPlayerList = computed(() => playerList.value.length > 0)
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
        <Badge v-if="isMobile" size="s" :variant="badgeVariant" class="px-1" @click="showPlayerList = !!(hasPlayerList && playerList.length > 0)">
          <Icon name="ph:circle-fill" />
          {{ currentPlayerCount }}
        </Badge>
        <Badge v-else :variant="badgeVariant" style="cursor: pointer;" @click="showModal = true">
          <Icon name="ph:circle-fill" />
          {{ currentPlayerCount }} Online Now
        </Badge>
        <template v-if="!isMobile && hasPlayerList">
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
      <Card v-for="player in playerList" :key="player.name" class="player-card">
        <Flex y-center gap="s">
          <Icon name="ph:user" />
          <Flex column gap="xs">
            <span>{{ player.name }}</span>
            <span v-if="player.detail" class="text-xs" style="color: var(--color-text-lighter);">{{ player.detail }}</span>
          </Flex>
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
