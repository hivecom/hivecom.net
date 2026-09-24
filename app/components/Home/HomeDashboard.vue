<script setup lang="ts">
import { Card, Flex, Grid } from '@dolanske/vui'
import DashboardNavTile from '@/components/Admin/Dashboard/DashboardNavTile.vue'
import HomeDashboardChat from '@/components/Home/HomeDashboardChat.vue'
import HomeDashboardEvents from '@/components/Home/HomeDashboardEvents.vue'
import HomeDashboardForum from '@/components/Home/HomeDashboardForum.vue'
import HomeDashboardGames from '@/components/Home/HomeDashboardGames.vue'
import HomeDashboardGameservers from '@/components/Home/HomeDashboardGameservers.vue'
import HomeDashboardVotesBanner from '@/components/Home/HomeDashboardVotesBanner.vue'
import MetricsRefreshCountdown from '@/components/Shared/Charts/MetricsRefreshCountdown.vue'

// Mirrors the top-level nav, which collapses on mobile
const navTiles = [
  { name: 'Chat', path: '/chat', icon: 'ph:chat-circle' },
  { name: 'Events', path: '/events', icon: 'ph:calendar-dots' },
  { name: 'Forum', path: '/forum', icon: 'ph:chats' },
  { name: 'Servers', path: '/servers/gameservers', icon: 'ph:hard-drives' },
  { name: 'Votes', path: '/votes', icon: 'ph:gavel' },
  { name: 'My Profile', path: '/profile', icon: 'ph:user' },
]
</script>

<template>
  <div class="dashboard">
    <div class="dashboard__content container-l">
      <Flex x-center y-center gap="m" expand>
        <h1 class="dashboard__greeting">
          Hello, friend
        </h1>
      </Flex>

      <div class="dashboard__nav">
        <Grid :columns="2" gap="s" expand>
          <DashboardNavTile v-for="tile in navTiles" :key="tile.path" v-bind="tile" />
        </Grid>
      </div>

      <!-- Votes are a line or two at most, so they sit above the grid and hide when there's nothing -->
      <HomeDashboardVotesBanner />

      <Grid :columns="3" gap="m" expand y-stretch class="dashboard__grid">
        <Card class="h-100">
          <HomeDashboardChat />
        </Card>

        <Card class="h-100">
          <HomeDashboardEvents />
        </Card>

        <Card class="h-100">
          <HomeDashboardForum />
        </Card>
      </Grid>

      <Grid :columns="2" gap="m" expand y-stretch class="dashboard__grid">
        <Card class="h-100">
          <HomeDashboardGames />
        </Card>

        <Card class="h-100">
          <HomeDashboardGameservers />
        </Card>
      </Grid>

      <Flex x-end>
        <MetricsRefreshCountdown />
      </Flex>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dashboard {
  position: relative;
  // Above the HomeBackdrop layer at z-index 0
  z-index: 1;
  width: 100%;
  min-height: 100vh;
  padding-bottom: var(--space-xl);
}

.dashboard__content {
  position: relative;
  z-index: 1;
  display: flex;
  padding-top: 192px;
  flex-direction: column;
  gap: var(--space-m);

  @media screen and (max-width: $breakpoint-m) {
    // note (dolanske): after adding the tabs, I just eyeballed the spacing
    padding-top: 160px;
    // padding-block: calc(var(--navbar-offset, 64px) + 2rem + var(--space-l)) 4rem;
    gap: var(--space-l);
  }
}

.dashboard__greeting {
  margin: 0;

  @media screen and (max-width: $breakpoint-m) {
    font-size: var(--font-size-xxl);
  }
}

.dashboard__nav {
  display: none;

  @media screen and (max-width: $breakpoint-m) {
    display: block;
  }
}

// Stretched cards keep their body top-aligned, pinning an empty state under the
// header. Only empty states and .dashboard-fill get the height, since a populated
// card would squeeze its sections.
.dashboard__grid :deep(.vui-card:has(.dashboard-empty, .dashboard-fill)) {
  display: flex;
  flex-direction: column;
}

.dashboard__grid :deep(.vui-card-content:has(.dashboard-empty, .dashboard-fill)) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.dashboard__grid :deep(.vui-card-content > *:has(> .dashboard-empty)),
.dashboard__grid :deep(.vui-card-content > .dashboard-fill) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

@media screen and (max-width: $breakpoint-m) {
  .dashboard__grid {
    --vui-grid-columns: 1 !important;
  }
}
</style>
