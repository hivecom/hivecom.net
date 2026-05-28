<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import CornerCard from '@/components/Shared/CornerCard.vue'
import CornerGroup from '@/components/Shared/CornerGroup.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'

interface CommunityStats {
  users: number
  usersAccurate: boolean
  gameservers: number
  age: number
  projects: number
  forumPosts: number
}

defineProps<{
  communityStats: CommunityStats
  loading: boolean
}>()
</script>

<template>
  <div class="hero-section__stats">
    <div class="hero-section__divider" />
    <CornerGroup class="hero-section__stats-grid">
      <GlowGroup>
        <GlowCard no-glow>
          <CornerCard>
            <NuxtLink to="/community" class="hero-section__stats-card hero-section__stats-card--clickable">
              <Flex x-center y-center class="hero-section__stats-value">
                <template v-if="loading">
                  <Skeleton height="2.5rem" width="4rem" />
                </template>
                <template v-else>
                  <CountDisplay :value="communityStats.users" :approx="!communityStats.usersAccurate" class="text-xxl" />
                </template>
              </Flex>
              <span class="text-xs">Users</span>
            </NuxtLink>
          </CornerCard>
        </GlowCard>

        <GlowCard no-glow>
          <CornerCard>
            <NuxtLink to="/forum" class="hero-section__stats-card hero-section__stats-card--clickable">
              <Flex x-center y-center class="hero-section__stats-value">
                <template v-if="loading">
                  <Skeleton height="2.5rem" width="4rem" />
                </template>
                <template v-else>
                  <CountDisplay :value="communityStats.forumPosts" class="text-xxl" />
                </template>
              </Flex>
              <span class="text-xs">Discussions</span>
            </NuxtLink>
          </CornerCard>
        </GlowCard>

        <GlowCard no-glow>
          <CornerCard>
            <NuxtLink to="/servers/gameservers" class="hero-section__stats-card hero-section__stats-card--clickable">
              <Flex x-center y-center class="hero-section__stats-value">
                <template v-if="loading">
                  <Skeleton height="2.5rem" width="2rem" />
                </template>
                <template v-else>
                  {{ communityStats.gameservers }}
                </template>
              </Flex>
              <span class="text-xs">Game Servers</span>
            </NuxtLink>
          </CornerCard>
        </GlowCard>

        <GlowCard no-glow>
          <CornerCard>
            <NuxtLink to="/community" class="hero-section__stats-card hero-section__stats-card--clickable">
              <Flex x-center y-center class="hero-section__stats-value">
                <span class="text-xxl">{{ communityStats.age }} Years</span>
              </Flex>
              <span class="text-xs">Founded in 2013</span>
            </NuxtLink>
          </CornerCard>
        </GlowCard>

        <GlowCard no-glow>
          <CornerCard>
            <NuxtLink to="/community/projects" class="hero-section__stats-card hero-section__stats-card--clickable">
              <Flex x-center class="hero-section__stats-value">
                <template v-if="loading">
                  <Skeleton height="2.5rem" width="2rem" />
                </template>
                <template v-else>
                  {{ communityStats.projects }}
                </template>
              </Flex>
              <span class="text-xs">Projects</span>
            </NuxtLink>
          </CornerCard>
        </GlowCard>
      </GlowGroup>
    </CornerGroup>
  </div>
</template>

<style scoped lang="scss">
.hero-section__stats {
  z-index: 1;
  margin-bottom: 48px;
}

:root.light {
  .hero-section__divider {
    border-image: linear-gradient(
        to right,
        transparent 0%,
        var(--color-border-strong) 10%,
        var(--color-border-strong) 90%,
        transparent 100%
      )
      1;
  }
}

.hero-section__divider {
  max-width: 640px;
  width: 100%;
  margin-top: 8px;
  display: block;
  margin-inline: auto;
  border-bottom: 1px solid;
  border-image: linear-gradient(
      to right,
      transparent 0%,
      var(--color-text-lighter) 10%,
      var(--color-text-lighter) 90%,
      transparent 100%
    )
    1;
}

.hero-section__stats-grid {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 1.5rem;
  gap: 1rem;
}

.hero-section__stats-card {
  display: block;
  width: 152px;
  border-radius: var(--border-radius-m);
  text-align: center;
  padding: var(--space-m);
  text-decoration: none;
  color: inherit;

  span {
    text-shadow: 2px 0 0 var(--color-bg) 3px;
  }

  &--clickable {
    cursor: pointer;

    &:active {
      opacity: 0.8;
    }
  }
}

.hero-section__stats-value {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: var(--space-xs);
}
</style>
