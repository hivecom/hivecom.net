<script setup lang="ts">
import { Button, Card, Flex, Grid } from '@dolanske/vui'
import DashboardNavTile from '@/components/Admin/Dashboard/DashboardNavTile.vue'
import LandingHeroShader from '@/components/Landing/LandingHeroBackground.vue'
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
  { name: 'Chat', path: '/chat', icon: 'ph:chat-circle', description: 'IRC and TeamSpeak' },
  { name: 'Events', path: '/events', icon: 'ph:calendar-dots', description: 'Upcoming and RSVPs' },
  { name: 'Forum', path: '/forum', icon: 'ph:chats', description: 'Discussions' },
  { name: 'Servers', path: '/gameservers', icon: 'ph:hard-drives', description: 'Game servers' },
  { name: 'Votes', path: '/votes', icon: 'ph:gavel', description: 'Referendums' },
  { name: 'My Profile', path: '/profile', icon: 'ph:user', description: 'You' },
]
</script>

<template>
  <div class="dashboard">
    <!-- Same nebula as the landing hero, no globe. Fixed so it stays a backdrop. -->
    <ClientOnly>
      <div class="dashboard__bg" aria-hidden="true">
        <LandingHeroShader class="dashboard__shader" />
      </div>
    </ClientOnly>

    <div class="dashboard__content container-l">
      <Flex x-between y-center wrap gap="m" expand>
        <h1 class="dashboard__greeting">
          Hello, {{ greetingName }}
        </h1>
        <Button plain @click="emit('viewLanding')">
          <template #start>
            <Icon name="ph:sparkle" />
          </template>
          Show landing page
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
  width: 100%;
  min-height: 100vh;
}

// Nebula backdrop - no VUI equivalent, so this bit stays bespoke. Scoped to the
// dashboard (absolute, not fixed) so it never paints over the footer below main.
.dashboard__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;

  // Fade the nebula toward the page background at the edges so cards stay legible.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 0%,
      transparent 0%,
      color-mix(in srgb, var(--color-bg) 70%, transparent) 60%,
      var(--color-bg) 100%
    );
  }
}

.dashboard__shader {
  position: absolute;
  inset: 0;
  opacity: 0.6;
}

.dashboard__content {
  position: relative;
  z-index: 1;
  // Clear the fixed navbar, then breathing room top and bottom.
  padding-block: calc(var(--navbar-offset, 64px) + var(--space-xl)) 6rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-xxl);
  width: 100%;
}

.dashboard__greeting {
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-extrabold);
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
