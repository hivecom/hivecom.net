<script setup lang="ts">
import { Button, Card, Flex, Grid } from '@dolanske/vui'
import DashboardNavTile from '@/components/Admin/Dashboard/DashboardNavTile.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useUserId } from '@/composables/useUserId'

// Lets the parent swap back to the marketing landing.
const emit = defineEmits<{
  viewLanding: []
}>()

const userId = useUserId()
const { user } = useDataUser(userId)
const greetingName = computed(() => user.value?.username?.trim() || 'friend')

// Mobile-only quick nav mirrors the top-level site navigation so the dashboard
// is a full jumping-off point on small screens.
const navTiles = [
  { name: 'Chat', path: '/chat', icon: 'ph:chat-circle' },
  { name: 'Events', path: '/events', icon: 'ph:calendar-dots' },
  { name: 'Forum', path: '/forum', icon: 'ph:chats' },
  { name: 'Servers', path: '/gameservers', icon: 'ph:hard-drives' },
  { name: 'Votes', path: '/votes', icon: 'ph:gavel' },
  { name: 'My Profile', path: '/profile', icon: 'ph:user' },
]
</script>

<template>
  <div class="dashboard">
    <!-- Nebula + stars are rendered once at the page level (HomeBackdrop) so they
         persist across the landing swap. -->
    <div class="dashboard__content container-l">
      <Flex x-between y-center gap="m" expand>
        <h1 class="dashboard__greeting">
          Hello, friend
        </h1>
        <Button plain square aria-label="Show landing page" @click="emit('viewLanding')">
          <Icon name="ph:house" size="20" />
        </Button>
      </Flex>

      <!-- Top-level nav tiles only show on mobile, where the global nav collapses. -->
      <div class="dashboard__nav">
        <Grid :columns="2" gap="s" expand>
          <DashboardNavTile v-for="tile in navTiles" :key="tile.path" v-bind="tile" />
        </Grid>
      </div>

      <!-- Primary card row: Events, Forum, Games -->
      <GlowGroup>
        <Grid :columns="3" gap="m" expand y-stretch class="dashboard__grid">
          <GlowCard>
            <Card>
              <h2 class="dashboard__card-title">
                Events
              </h2>
              <p class="dashboard__placeholder">
                Your upcoming and relevant events land here.
              </p>
            </Card>
          </GlowCard>

          <GlowCard>
            <Card>
              <h2 class="dashboard__card-title">
                Forum
              </h2>
              <p class="dashboard__placeholder">
                Latest activity from your posts and subscriptions.
              </p>
            </Card>
          </GlowCard>

          <GlowCard>
            <Card>
              <h2 class="dashboard__card-title">
                Games
              </h2>
              <p class="dashboard__placeholder">
                Games you play and who's playing right now.
              </p>
            </Card>
          </GlowCard>
        </Grid>
      </GlowGroup>

      <!-- Secondary card row: Gameservers, Votes -->
      <GlowGroup>
        <Grid :columns="2" gap="m" expand y-stretch class="dashboard__grid">
          <GlowCard>
            <Card>
              <h2 class="dashboard__card-title">
                Gameservers
              </h2>
              <p class="dashboard__placeholder">
                Server activity and what's live right now.
              </p>
            </Card>
          </GlowCard>

          <GlowCard>
            <Card>
              <h2 class="dashboard__card-title">
                Votes
              </h2>
              <p class="dashboard__placeholder">
                Anything that needs deciding, and your latest results.
              </p>
            </Card>
          </GlowCard>
        </Grid>
      </GlowGroup>
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
}

.dashboard__content {
  position: relative;
  z-index: 1;
  // Clear the fixed navbar, then match the standard .page + .page-title top gap
  // (see assets/elements/page.scss) so the greeting lines up with other pages.
  padding-block: calc(var(--navbar-offset, 64px) + 4rem + var(--space-l)) 6rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-xxl);
  width: 100%;

  @media screen and (max-width: $breakpoint-m) {
    padding-block: calc(var(--navbar-offset, 64px) + 2rem + var(--space-l)) 4rem;
    gap: var(--space-l);
  }
}

.dashboard__greeting {
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-extrabold);
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

.dashboard__card-title {
  font-size: var(--font-size-s);
  text-transform: uppercase;
  color: var(--color-text-lighter);
  letter-spacing: 0.04em;
  margin-bottom: var(--space-l);
}

.dashboard__placeholder {
  color: var(--color-text-light);
}

@media screen and (max-width: $breakpoint-m) {
  .dashboard__grid {
    --vui-grid-columns: 1 !important;
  }
}
</style>
