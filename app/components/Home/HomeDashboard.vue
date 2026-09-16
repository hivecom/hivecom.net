<script setup lang="ts">
import { Card, Flex, Grid } from '@dolanske/vui'
import DashboardNavTile from '@/components/Admin/Dashboard/DashboardNavTile.vue'
import HomeDashboardEvents from '@/components/Home/HomeDashboardEvents.vue'
import HomeDashboardForum from '@/components/Home/HomeDashboardForum.vue'
import HomeDashboardGames from '@/components/Home/HomeDashboardGames.vue'
import HomeDashboardGameservers from '@/components/Home/HomeDashboardGameservers.vue'
import HomeDashboardVotes from '@/components/Home/HomeDashboardVotes.vue'

// Mobile-only quick nav mirrors the top-level site navigation so the dashboard
// is a full jumping-off point on small screens.
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
    <!-- Nebula + stars are rendered once at the page level (HomeBackdrop) so they
         persist across the landing swap. -->
    <div class="dashboard__content container-l">
      <Flex x-center y-center gap="m" expand>
        <h1 class="dashboard__greeting">
          Hello, friend
        </h1>
      </Flex>

      <!-- Top-level nav tiles only show on mobile, where the global nav collapses. -->
      <div class="dashboard__nav">
        <Grid :columns="2" gap="s" expand>
          <DashboardNavTile v-for="tile in navTiles" :key="tile.path" v-bind="tile" />
        </Grid>
      </div>

      <!-- Primary card row: Events, Forum, Games -->
      <Grid :columns="3" gap="m" expand y-stretch class="dashboard__grid">
        <Card class="h-100">
          <HomeDashboardEvents />
        </Card>

        <Card class="h-100">
          <HomeDashboardForum />
        </Card>

        <Card class="h-100">
          <HomeDashboardGames />
        </Card>
      </Grid>

      <!-- Secondary card row: Gameservers, Votes -->
      <Grid :columns="2" gap="m" expand y-stretch class="dashboard__grid">
        <Card class="h-100">
          <HomeDashboardGameservers />
        </Card>

        <Card class="h-100">
          <HomeDashboardVotes />
        </Card>
      </Grid>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dashboard {
  position: relative;
  // Sit above the persistent page backdrop (HomeBackdrop, z-index 0).
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

// Cards stretch to the tallest one in their row, but the body inside stays
// top-aligned, so an empty state ends up pinned under the header. Push the
// height down through the card, but only when the body is an empty state -
// doing it to a populated card squeezes its sections instead.
.dashboard__grid :deep(.vui-card:has(.dashboard-empty)) {
  display: flex;
  flex-direction: column;
}

.dashboard__grid :deep(.vui-card-content:has(.dashboard-empty)) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.dashboard__grid :deep(.vui-card-content > *:has(> .dashboard-empty)) {
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
