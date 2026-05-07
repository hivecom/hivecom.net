<script setup lang="ts">
import { Badge, BadgeGroup, Button, Card, Divider, Flex, Grid } from '@dolanske/vui'
import { computed, ref } from 'vue'
import Alerts from '@/components/Admin/Alerts.vue'
import IncomeChart from '@/components/Admin/Dashboard/IncomeChart.vue'
import UserChart from '@/components/Admin/Dashboard/UserChart.vue'
import KPIOverview from '@/components/Admin/KPIOverview.vue'
import ChartDiscussions from '@/components/Shared/Charts/ChartDiscussions.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import ChartOnlineUsers from '@/components/Shared/Charts/ChartOnlineUsers.vue'
import ChartTeamSpeakOnline from '@/components/Shared/Charts/ChartTeamSpeakOnline.vue'
import { useDataAdminKPIs } from '@/composables/useDataAdminKPIs'
import { useBreakpoint } from '@/lib/mediaQuery'

useDataAdminKPIs()

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
        <Alerts />

        <NuxtLink to="/admin/users" class="dashboard__metric-link">
          <Card separators class="card-bg">
            <template #header>
              <Flex x-between y-center expand>
                <span class="dashboard__charts-title">Users</span>
                <Flex y-center gap="xs">
                  <BadgeGroup>
                    <Badge
                      v-if="userTotal !== null"
                      :variant="userTotal > 0 ? 'success' : userTotal < 0 ? 'danger' : 'neutral'"
                      size="s"
                      circle
                      filled
                    >
                      {{ userTotal > 0 ? '+' : '' }}{{ userTotal }}
                    </Badge>
                    <Badge
                      v-if="userMomGrowth !== null"
                      :variant="userMomGrowth > 0 ? 'success' : userMomGrowth < 0 ? 'danger' : 'neutral'"
                      size="s"
                    >
                      {{ userMomGrowth > 0 ? '+' : '' }}{{ userMomGrowth }}%
                    </Badge>
                  </BadgeGroup>
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

        <NuxtLink to="/admin/funding" class="dashboard__metric-link">
          <Card separators class="card-bg">
            <template #header>
              <Flex x-between y-center expand>
                <span class="dashboard__charts-title">Funding</span>
                <Flex y-center gap="xs">
                  <BadgeGroup>
                    <Badge
                      v-if="incomeTotal !== null"
                      :variant="incomeTotal > 0 ? 'success' : incomeTotal < 0 ? 'danger' : 'neutral'"
                      size="s"
                      circle
                      filled
                    >
                      {{ incomeTotal > 0 ? '+' : '' }}€{{ incomeTotal }}
                    </Badge>
                    <Badge
                      v-if="incomeMomGrowth !== null"
                      :variant="incomeMomGrowth > 0 ? 'success' : incomeMomGrowth < 0 ? 'danger' : 'neutral'"
                      size="s"
                    >
                      {{ incomeMomGrowth > 0 ? '+' : '' }}{{ incomeMomGrowth }}%
                    </Badge>
                  </BadgeGroup>
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
                  <span class="dashboard__charts-period">Last 24 hours</span>
                  <Button variant="link" size="s" square @click.prevent="navigateTo('/admin/metrics')">
                    <Icon name="ph:arrow-square-out" size="16" />
                  </Button>
                </Flex>
              </Flex>
            </template>
            <div class="dashboard__charts-body">
              <ChartOnlineUsers period="24h" :window="null" :utc="false" fresh compact show-y-axis />
              <Divider />
              <ChartTeamSpeakOnline period="24h" :window="null" :utc="false" compact show-y-axis />
              <Divider />
              <ChartGameserversPlayers period="24h" :window="null" :utc="false" compact show-y-axis />
              <Divider />
              <ChartDiscussions period="24h" :window="null" :utc="false" compact show-y-axis />
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
