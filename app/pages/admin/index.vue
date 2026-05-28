<script setup lang="ts">
import { Button, Card, Divider, Flex, Grid } from '@dolanske/vui'
import { computed, defineAsyncComponent, ref } from 'vue'
import Alerts from '@/components/Admin/Alerts.vue'
import KPIOverview from '@/components/Admin/KPIOverview.vue'
import GrowthBadge from '@/components/Shared/GrowthBadge.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDataAdminKPIs } from '@/composables/useDataAdminKPIs'
import { useBreakpoint } from '@/lib/mediaQuery'

const IncomeChart = defineAsyncComponent(() => import('@/components/Admin/Dashboard/IncomeChart.vue'))
const UserChart = defineAsyncComponent(() => import('@/components/Admin/Dashboard/UserChart.vue'))
const ChartDiscussions = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartDiscussions.vue'))
const ChartGameserversPlayers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameserversPlayers.vue'))
const ChartOnlineUsers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartOnlineUsers.vue'))
const ChartTeamSpeakOnline = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartTeamSpeakOnline.vue'))

definePageMeta({ layout: 'admin' })

useDataAdminKPIs()

const { canViewFunding, canViewUsers, hasPermission } = useAdminPermissions()
const canViewAlerts = computed(() => hasPermission('alerts.read'))

const userChartRef = ref<InstanceType<typeof UserChart> | null>(null)
const userMomGrowth = computed(() => userChartRef.value?.momGrowth ?? null)
const userTotal = computed(() => userChartRef.value?.currentDiff ?? null)

const incomeChartRef = ref<InstanceType<typeof IncomeChart> | null>(null)
const incomeMomGrowth = computed(() => incomeChartRef.value?.momGrowth ?? null)
const incomeTotal = computed(() => incomeChartRef.value?.currentDiff ?? null)

const isBelowMedium = useBreakpoint('<m')
const gridColumns = computed(() => isBelowMedium.value ? 1 : '2fr 3fr')
</script>

<template>
  <Flex column gap="s" expand>
    <Flex column gap="xs">
      <h1 style="margin: 0;">
        Dashboard
      </h1>
      <p class="text-color-light" style="margin: 0;">
        Welcome to the admin panel have a look around, any KPI you can think of can be found
      </p>
    </Flex>

    <KPIOverview />

    <Grid :columns="gridColumns" gap="s" align="start" expand>
      <!-- Left col: alerts + metric cards -->
      <Flex column gap="s" expand>
        <Alerts v-if="canViewAlerts" />

        <NuxtLink v-if="canViewUsers" to="/admin/users" class="dashboard__metric-link">
          <Card separators class="card-bg">
            <template #header>
              <Flex x-between y-center expand>
                <span class="dashboard__charts-title">Users</span>
                <Flex y-center gap="xs">
                  <GrowthBadge :growth="userMomGrowth" :value="userTotal" size="s" />
                  <Button variant="link" size="s" square @click.prevent="navigateTo('/admin/users')">
                    <Icon name="ph:arrow-square-out" size="16" />
                  </Button>
                </Flex>
              </Flex>
            </template>
            <div class="dashboard__metric-chart">
              <UserChart ref="userChartRef" />
            </div>
          </Card>
        </NuxtLink>

        <NuxtLink v-if="canViewFunding" to="/admin/funding" class="dashboard__metric-link">
          <Card separators class="card-bg">
            <template #header>
              <Flex x-between y-center expand>
                <span class="dashboard__charts-title">Funding</span>
                <Flex y-center gap="xs">
                  <GrowthBadge :growth="incomeMomGrowth" :value="incomeTotal" prefix="€" size="s" />
                  <Button variant="link" size="s" square @click.prevent="navigateTo('/admin/funding')">
                    <Icon name="ph:arrow-square-out" size="16" />
                  </Button>
                </Flex>
              </Flex>
            </template>
            <div class="dashboard__metric-chart">
              <IncomeChart ref="incomeChartRef" />
            </div>
          </Card>
        </NuxtLink>
      </Flex>

      <!-- Right col: stacked charts -->
      <Flex column gap="m">
        <NuxtLink to="/admin/metrics" class="dashboard__metrics-link">
          <Card separators class="card-bg" :padding="false">
            <template #header>
              <Flex x-between y-center expand class="px-m py-s">
                <span class="dashboard__charts-title">Metrics</span>
                <Flex y-center gap="s">
                  <span class="dashboard__charts-period">Last 7 days</span>
                  <Button variant="link" size="s" square @click.prevent="navigateTo('/admin/metrics')">
                    <Icon name="ph:arrow-square-out" size="16" />
                  </Button>
                </Flex>
              </Flex>
            </template>
            <div class="dashboard__charts-body">
              <ChartOnlineUsers period="7d" :window="null" :utc="false" fresh compact show-y-axis />
              <Divider />
              <ChartTeamSpeakOnline period="7d" :window="null" :utc="false" compact show-y-axis />
              <Divider />
              <ChartGameserversPlayers period="7d" :window="null" :utc="false" compact show-y-axis />
              <Divider />
              <ChartDiscussions period="7d" :window="null" :utc="false" compact show-y-axis show-x-axis />
            </div>
          </Card>
        </NuxtLink>
      </Flex>
    </Grid>
  </Flex>
</template>

<style scoped lang="scss">
.dashboard {
  &__metric-link {
    display: block;
    width: 100%;
    text-decoration: none;
    border-radius: var(--border-radius-l);

    &:hover :deep(.vui-card) {
      border-color: var(--color-border-strong);
      background: var(--color-bg-raised);
    }

    &:hover :deep(.chart-container) {
      background-color: var(--color-bg-raised);
    }
  }

  &__metric-chart {
    :deep(.chart-container) {
      border: none;
      border-radius: 0;
      padding: 0;
      min-height: unset;
    }
  }

  &__metrics-link {
    display: block;
    width: 100%;
    text-decoration: none;
    border-radius: var(--border-radius-l);

    &:hover :deep(.vui-card) {
      border-color: var(--color-border-strong);
      background: var(--color-bg-raised);
    }

    &:hover :deep(.chart-container) {
      background-color: var(--color-bg-raised);
    }
  }

  &__charts-body {
    .chart-container {
      border: none;
      border-radius: 0;
    }
  }

  &__charts-title {
    font-size: var(--font-size-m);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__charts-period {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}
</style>
