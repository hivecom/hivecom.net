<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
import type { ForumUserStat } from '@/composables/useForumStats'
import { Badge, BreadcrumbItem, Breadcrumbs, Card, Divider, Flex, Select, Skeleton, theme } from '@dolanske/vui'
import { useElementSize } from '@vueuse/core'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { computed, onBeforeMount, ref, watchEffect } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import { useBulkUserData } from '@/composables/useCacheUserData'
import { useForumStats } from '@/composables/useForumStats'
import { getChartGridColor, getLineChartDefaults } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

useSeoMeta({
  title: 'Forum Statistics',
  ogTitle: 'Forum Statistics',
})

const { stats, loading, error, fetchStats } = useForumStats()

onBeforeMount(async () => {
  await fetchStats()
})

// ── Bulk load user data for leaderboards ─────────────────────────────────────
const allUserIds = computed(() => {
  if (stats.value == null)
    return []
  const ids = new Set<string>()
  for (const u of stats.value.topCombined) ids.add(u.user_id)
  for (const u of stats.value.topRepliers) ids.add(u.user_id)
  for (const u of stats.value.topStarters) ids.add(u.user_id)
  return [...ids]
})

useBulkUserData(allUserIds, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

// ── Activity chart ───────────────────────────────────────────────────────────
const activityChartWrapperRef = ref<HTMLElement | null>(null)
const activityChartRef = ref<ChartComponentRef<'line'> | null>(null)
const { width: activityChartWidth } = useElementSize(activityChartWrapperRef, { width: 0, height: 0 })

const activityChartData = computed(() => {
  if (stats.value == null)
    return { labels: [], datasets: [] }

  const points = stats.value.activityOverTime
  const labels = points.map(p => p.date)

  return {
    labels,
    datasets: [
      {
        label: 'Discussions',
        data: points.map(p => p.discussions),
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Replies',
        data: points.map(p => p.replies),
        borderColor: '#22C55E',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }
})

const activityChartOptions: ChartOptions<'line'> = {
  plugins: {
    title: {
      text: 'Weekly Forum Activity',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Week of',
      },
      ticks: {
        maxTicksLimit: 16,
      },
    },
    y: {
      title: {
        display: true,
        text: 'Count',
      },
    },
  },
}

watchEffect(() => {
  const width = activityChartWidth.value
  const chart = activityChartRef.value?.chart
  if (!width || !chart)
    return
  const containerHeight = activityChartWrapperRef.value?.clientHeight
  chart.resize(Math.floor(width), containerHeight)
})

// ── Topic breakdown chart ────────────────────────────────────────────────────
const topicChartWrapperRef = ref<HTMLElement | null>(null)
const topicChartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: topicChartWidth } = useElementSize(topicChartWrapperRef, { width: 0, height: 0 })

const topicChartData = computed(() => {
  if (stats.value == null)
    return { labels: [], datasets: [] }

  const topics = stats.value.topicBreakdown.slice(0, 12)
  const labels = topics.map(t => t.topic_name)

  return {
    labels,
    datasets: [
      {
        label: 'Discussions',
        data: topics.map(t => t.discussion_count),
        backgroundColor: 'rgba(139, 92, 246, 0.7)',
        borderColor: '#8B5CF6',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Replies',
        data: topics.map(t => t.reply_count),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: '#22C55E',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }
})

function getBarChartDefaults(currentTheme: string): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 50,
      delay: 0,
    },
    plugins: {
      title: {
        display: true,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxHeight: 10,
          boxWidth: 10,
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: getChartGridColor(currentTheme),
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: {
          color: getChartGridColor(currentTheme),
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  }
}

const topicChartOptions: ChartOptions<'bar'> = {
  plugins: {
    title: {
      text: 'Activity by Topic',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      ticks: {
        maxRotation: 45,
        minRotation: 0,
      },
    },
    y: {
      title: {
        display: true,
        text: 'Count',
      },
    },
  },
}

watchEffect(() => {
  const width = topicChartWidth.value
  const chart = topicChartRef.value?.chart
  if (!width || !chart)
    return
  const containerHeight = topicChartWrapperRef.value?.clientHeight
  chart.resize(Math.floor(width), containerHeight)
})

// ── Leaderboard mode ─────────────────────────────────────────────────────────
type LeaderboardMode = 'combined' | 'discussions' | 'replies'

const leaderboardMode = ref<LeaderboardMode>('combined')

const leaderboardOptions = [
  { label: 'Discussions + Replies', value: 'combined' },
  { label: 'Discussions', value: 'discussions' },
  { label: 'Replies', value: 'replies' },
]

// VUI Select always binds SelectOption[] - wrap/unwrap to keep internal state as a plain string
const selectedLeaderboardOption = computed({
  get() {
    const match = leaderboardOptions.find(o => o.value === leaderboardMode.value)
    return match != null ? [match] : [leaderboardOptions[0]!]
  },
  set(options) {
    if (options && options[0])
      leaderboardMode.value = options[0].value as LeaderboardMode
  },
})

const activeLeaderboard = computed<ForumUserStat[]>(() => {
  if (stats.value == null)
    return []
  switch (leaderboardMode.value) {
    case 'discussions': return stats.value.topStarters
    case 'replies': return stats.value.topRepliers
    default: return stats.value.topCombined
  }
})

const leaderboardLabel = computed(() => {
  switch (leaderboardMode.value) {
    case 'discussions': return { header: 'Top Discussion Starters', unit: 'discussions', icon: 'ph:scroll', barClass: 'leaderboard__bar--discussions' }
    case 'replies': return { header: 'Top Repliers', unit: 'replies', icon: 'ph:chats-circle', barClass: 'leaderboard__bar--replies' }
    default: return { header: 'Most Active Members', unit: 'posts', icon: 'ph:users', barClass: 'leaderboard__bar--combined' }
  }
})

// ── Podium helpers ───────────────────────────────────────────────────────────
const podiumMedals: [string, string, string] = ['ph:trophy-fill', 'ph:medal-fill', 'ph:medal-fill']
const podiumColors: [string, string, string] = ['#FFD700', '#C0C0C0', '#CD7F32']
</script>

<template>
  <div class="page forum-stats">
    <ClientOnly>
      <section class="page-title mb-xl">
        <Breadcrumbs>
          <BreadcrumbItem @click="$router.push('/forum')">
            Forum
          </BreadcrumbItem>
          <BreadcrumbItem>
            Statistics
          </BreadcrumbItem>
        </Breadcrumbs>
        <h1>Forum Statistics</h1>
        <p>Yapping olympics</p>
      </section>

      <!-- Loading state -->
      <template v-if="loading">
        <Flex column gap="l">
          <!-- Podium + leaderboard card skeleton -->
          <Card class="stats-podium-card">
            <!-- Card header -->
            <template #header>
              <Flex expand x-between y-center>
                <Skeleton :width="160" :height="16" :radius="4" />
                <Skeleton :width="180" :height="32" :radius="4" />
              </Flex>
            </template>

            <!-- Podium: 3 slots arranged 2nd, 1st, 3rd -->
            <Flex class="podium" x-center y-end gap="m">
              <!-- 2nd place -->
              <div class="podium__slot podium__slot--2">
                <div class="podium__user">
                  <Skeleton :width="28" :height="28" :radius="14" />
                  <Skeleton :width="48" :height="48" :radius="24" />
                  <Skeleton :width="80" :height="14" :radius="4" />
                </div>
                <div class="podium__pillar podium__pillar--2">
                  <Skeleton :width="24" :height="20" :radius="4" />
                  <Skeleton :width="40" :height="18" :radius="4" />
                </div>
              </div>
              <!-- 1st place -->
              <div class="podium__slot podium__slot--1">
                <div class="podium__user">
                  <Skeleton :width="28" :height="28" :radius="14" />
                  <Skeleton :width="48" :height="48" :radius="24" />
                  <Skeleton :width="90" :height="14" :radius="4" />
                </div>
                <div class="podium__pillar podium__pillar--1">
                  <Skeleton :width="24" :height="20" :radius="4" />
                  <Skeleton :width="40" :height="18" :radius="4" />
                </div>
              </div>
              <!-- 3rd place -->
              <div class="podium__slot podium__slot--3">
                <div class="podium__user">
                  <Skeleton :width="28" :height="28" :radius="14" />
                  <Skeleton :width="48" :height="48" :radius="24" />
                  <Skeleton :width="70" :height="14" :radius="4" />
                </div>
                <div class="podium__pillar podium__pillar--3">
                  <Skeleton :width="24" :height="20" :radius="4" />
                  <Skeleton :width="40" :height="18" :radius="4" />
                </div>
              </div>
            </Flex>

            <Divider />

            <!-- Leaderboard rows -->
            <div v-for="i in 10" :key="i" class="leaderboard__row">
              <Flex gap="m" y-center expand>
                <Skeleton :width="20" :height="14" :radius="3" />
                <Skeleton :width="28" :height="28" :radius="14" />
                <Skeleton :width="90" :height="14" :radius="4" />
                <div class="leaderboard__bar-wrapper">
                  <Skeleton :height="6" :width="Math.max(20, 100 - i * 8)" :radius="3" />
                </div>
                <Skeleton :width="36" :height="22" :radius="4" />
              </Flex>
            </div>
          </Card>

          <!-- Counter grid skeleton -->
          <div class="stats-counters">
            <Card v-for="i in 5" :key="i" class="stats-counter-card">
              <div class="stats-counter">
                <Skeleton :width="24" :height="24" :radius="4" />
                <Skeleton :width="60" :height="32" :radius="4" />
                <Skeleton :width="100" :height="12" :radius="4" />
              </div>
            </Card>
          </div>

          <!-- Chart card skeletons -->
          <Card v-for="i in 2" :key="i">
            <div class="chart-container">
              <Skeleton :height="320" :radius="8" style="opacity: 0.3;" />
            </div>
          </Card>
        </Flex>
      </template>

      <!-- Error state -->
      <template v-else-if="error">
        <Card>
          <Flex x-center y-center style="padding: var(--space-xl);">
            <p class="text-red">
              {{ error }}
            </p>
          </Flex>
        </Card>
      </template>

      <!-- Stats content -->
      <template v-else-if="stats">
        <!-- Unified podium + leaderboard card -->
        <Card class="mb-xl stats-podium-card">
          <template #header>
            <Flex expand x-between y-center>
              <Flex gap="xs" y-center>
                <Icon :name="leaderboardLabel.icon" size="20" />
                <strong>{{ leaderboardLabel.header }}</strong>
              </Flex>
              <Select
                v-model="selectedLeaderboardOption"
                :options="leaderboardOptions"
                :show-clear="false"
                size="m"
              />
            </Flex>
          </template>

          <!-- Podium: Top 3 -->
          <Flex class="podium" x-center y-end gap="m">
            <template v-for="(position, posIndex) in [1, 0, 2]" :key="`${leaderboardMode}-${position}`">
              <div
                v-if="activeLeaderboard[position]"
                class="podium__slot"
                :class="`podium__slot--${position + 1}`"
              >
                <div class="podium__user">
                  <Icon
                    :name="podiumMedals[position]!"
                    size="28"
                    :style="{ color: podiumColors[position] }"
                  />
                  <UserAvatar
                    :user-id="activeLeaderboard[position].user_id"
                    size="l"
                    linked
                    show-preview
                  />
                  <UserName
                    :user-id="activeLeaderboard[position].user_id"
                    size="s"
                    show-preview
                  />
                </div>
                <div
                  class="podium__pillar"
                  :class="`podium__pillar--${position + 1}`"
                >
                  <span class="podium__rank">#{{ position + 1 }}</span>
                  <span class="podium__count">{{ activeLeaderboard[position].count.toLocaleString() }}</span>
                  <span class="podium__count-label">{{ leaderboardLabel.unit }}</span>
                </div>
              </div>
              <div v-else :key="`empty-${posIndex}`" class="podium__slot podium__slot--empty" />
            </template>
          </Flex>

          <Divider />

          <!-- Leaderboard: Top 10 -->
          <div class="leaderboard">
            <div
              v-for="(user, index) in activeLeaderboard"
              :key="`${leaderboardMode}-${user.user_id}`"
              class="leaderboard__row"
            >
              <Flex gap="m" y-center expand>
                <span class="leaderboard__rank" :class="{ 'leaderboard__rank--top': index < 3 }">
                  {{ index + 1 }}
                </span>
                <div class="leaderboard__user">
                  <UserAvatar :user-id="user.user_id" size="s" linked show-preview />
                  <UserName :user-id="user.user_id" size="s" show-preview />
                </div>
                <div class="leaderboard__bar-wrapper">
                  <div
                    class="leaderboard__bar"
                    :class="leaderboardLabel.barClass"
                    :style="{ width: `${(user.count / (activeLeaderboard[0]?.count ?? 1)) * 100}%` }"
                  />
                </div>
                <Badge variant="neutral" size="s">
                  {{ user.count.toLocaleString() }}
                </Badge>
              </Flex>
            </div>
          </div>
        </Card>

        <!-- Summary counters -->
        <div class="mb-xl stats-counters">
          <Card class="stats-counter-card">
            <div class="stats-counter">
              <Icon name="ph:folder-open" size="24" class="stats-counter__icon stats-counter__icon--topics" />
              <span class="stats-counter__value">{{ stats.totalTopics }}</span>
              <span class="stats-counter__label">Topics</span>
            </div>
          </Card>
          <Card class="stats-counter-card">
            <div class="stats-counter">
              <Icon name="ph:scroll" size="24" class="stats-counter__icon stats-counter__icon--discussions" />
              <span class="stats-counter__value">{{ stats.totalDiscussions.toLocaleString() }}</span>
              <span class="stats-counter__label">Discussions</span>
            </div>
          </Card>
          <Card class="stats-counter-card">
            <div class="stats-counter">
              <Icon name="ph:chats-circle" size="24" class="stats-counter__icon stats-counter__icon--replies" />
              <span class="stats-counter__value">{{ stats.totalReplies.toLocaleString() }}</span>
              <span class="stats-counter__label">Replies</span>
            </div>
          </Card>
          <Card class="stats-counter-card">
            <div class="stats-counter">
              <Icon name="ph:chart-line-up" size="24" class="stats-counter__icon stats-counter__icon--avg" />
              <span class="stats-counter__value">{{ stats.avgRepliesPerDiscussion }}</span>
              <span class="stats-counter__label">Avg replies / discussion</span>
            </div>
          </Card>
          <Card class="stats-counter-card">
            <div class="stats-counter">
              <Icon name="ph:calendar-check" size="24" class="stats-counter__icon stats-counter__icon--daily" />
              <span class="stats-counter__value">{{ stats.avgPostsPerDay }}</span>
              <span class="stats-counter__label">Avg posts / day</span>
            </div>
          </Card>
        </div>

        <!-- Activity over time chart -->
        <Card class="mb-xl">
          <div class="chart-container">
            <div ref="activityChartWrapperRef" :key="theme" class="chart-wrapper">
              <Line
                ref="activityChartRef"
                :data="activityChartData"
                :options="deepMergePlainObjects(getLineChartDefaults(theme), activityChartOptions)"
              />
            </div>
          </div>
        </Card>

        <!-- Topic breakdown chart -->
        <Card class="mb-xl">
          <div class="chart-container">
            <div ref="topicChartWrapperRef" :key="`topic-${theme}`" class="chart-wrapper">
              <Bar
                ref="topicChartRef"
                :data="topicChartData"
                :options="deepMergePlainObjects(getBarChartDefaults(theme), topicChartOptions)"
              />
            </div>
          </div>
        </Card>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

// ── Summary counters ─────────────────────────────────────────────────────────
.stats-counters {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-m);

  @media screen and (max-width: $breakpoint-m) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media screen and (max-width: $breakpoint-s) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stats-counter-card {
  min-width: 0;
}

.stats-counter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-m) var(--space-s);
  text-align: center;

  &__icon {
    opacity: 0.6;

    &--discussions {
      color: #8b5cf6;
    }

    &--replies {
      color: #22c55e;
    }

    &--topics {
      color: #3b82f6;
    }

    &--avg {
      color: #f59e0b;
    }

    &--daily {
      color: #ec4899;
    }
  }

  &__value {
    font-size: var(--font-size-xxxl);
    font-weight: 700;
    line-height: 1;
    color: var(--color-text);
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
  }
}

// ── Podium ───────────────────────────────────────────────────────────────────
.stats-podium-card {
  overflow: hidden;
}

.podium {
  padding: var(--space-m) var(--space-s) 0;
  min-height: 280px;

  &__slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    max-width: 160px;

    &--empty {
      visibility: hidden;
    }
  }

  &__user {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xxs);
    margin-bottom: var(--space-s);
    min-height: 80px;
    justify-content: flex-end;
  }

  &__pillar {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    border-radius: var(--border-radius-m) var(--border-radius-m) 0 0;
    padding: var(--space-s) var(--space-xs);

    &--1 {
      height: 140px;
      background: linear-gradient(180deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.05) 100%);
      border: 1px solid rgba(255, 215, 0, 0.3);
      border-bottom: none;
    }

    &--2 {
      height: 100px;
      background: linear-gradient(180deg, rgba(192, 192, 192, 0.2) 0%, rgba(192, 192, 192, 0.05) 100%);
      border: 1px solid rgba(192, 192, 192, 0.3);
      border-bottom: none;
    }

    &--3 {
      height: 70px;
      background: linear-gradient(180deg, rgba(205, 127, 50, 0.2) 0%, rgba(205, 127, 50, 0.05) 100%);
      border: 1px solid rgba(205, 127, 50, 0.3);
      border-bottom: none;
    }
  }

  &__rank {
    font-size: var(--font-size-l);
    font-weight: 800;
    color: var(--color-text);
  }

  &__count {
    font-size: var(--font-size-m);
    font-weight: 700;
    color: var(--color-text);
    line-height: 1;
  }

  &__count-label {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
  }
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
.leaderboard {
  &__row {
    padding: var(--space-xs) var(--space-s);
    transition: background-color var(--transition);

    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border-weak);
    }

    &:hover {
      background-color: var(--color-bg-medium);
    }
  }

  &__rank {
    font-size: var(--font-size-s);
    font-weight: 700;
    color: var(--color-text-lighter);
    min-width: 24px;
    text-align: center;

    &--top {
      color: var(--color-accent);
    }
  }

  &__user {
    flex-shrink: 0;
    min-width: 140px;
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  &__bar-wrapper {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background-color: var(--color-bg-lowered);
    overflow: hidden;
    min-width: 40px;
  }

  &__bar {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s cubic-bezier(0.65, 0, 0.35, 1);

    &--combined {
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
    }

    &--replies {
      background: linear-gradient(90deg, #22c55e, #4ade80);
    }

    &--discussions {
      background: linear-gradient(90deg, #8b5cf6, #a78bfa);
    }
  }
}

// ── Charts ───────────────────────────────────────────────────────────────────
.chart-container {
  width: 100%;
  min-height: 320px;
  padding: var(--space-m);
}

.chart-wrapper {
  height: 320px;
  width: 100%;
  position: relative;
}

.chart-wrapper :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}
</style>
