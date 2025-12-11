<script setup lang="ts">
import { Divider, Flex, Skeleton } from '@dolanske/vui'

interface CommunityStats {
  members: number
  membersAccurate: boolean
  gameservers: number
  age: number
  projects: number
}

defineProps<{
  communityStats: CommunityStats
  loading: boolean
}>()
</script>

<template>
  <div class="hero-section__stats">
    <ClientOnly>
      <Divider />
    </ClientOnly>
    <div class="hero-section__stats-grid">
      <NuxtLink to="/community" class="hero-section__stats-card hero-section__stats-card--clickable">
        <Flex x-center class="hero-section__stats-value">
          <template v-if="loading">
            <Skeleton height="2.5rem" width="4rem" />
          </template>
          <template v-else>
            {{ communityStats.members }}{{ communityStats.membersAccurate ? '' : '+' }}
          </template>
        </Flex>
        <span class="text-xs text-color-lighter">Community Members</span>
      </NuxtLink>

      <NuxtLink to="/gameservers" class="hero-section__stats-card hero-section__stats-card--clickable">
        <Flex x-center class="hero-section__stats-value">
          <template v-if="loading">
            <Skeleton height="2.5rem" width="2rem" />
          </template>
          <template v-else>
            {{ communityStats.gameservers }}
          </template>
        </Flex>
        <span class="text-xs text-color-lighter">Game Servers</span>
      </NuxtLink>

      <NuxtLink to="/community" class="hero-section__stats-card hero-section__stats-card--clickable">
        <span class="hero-section__stats-value">{{ communityStats.age }} Years</span>
        <span class="text-xs text-color-lighter">Founded in 2013</span>
      </NuxtLink>

      <NuxtLink to="/community/projects" class="hero-section__stats-card hero-section__stats-card--clickable">
        <Flex x-center class="hero-section__stats-value">
          <template v-if="loading">
            <Skeleton height="2.5rem" width="2rem" />
          </template>
          <template v-else>
            {{ communityStats.projects }}
          </template>
        </Flex>
        <span class="text-xs text-color-lighter">Community Projects</span>
      </NuxtLink>
    </div>
  </div>
  <ClientOnly>
    <Divider />
  </ClientOnly>
</template>

<style scoped lang="scss">
.hero-section__stats {
  z-index: 1;
}

.hero-section__stats-grid {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 1.5rem;
  gap: 1.5rem;
}

.hero-section__stats-card {
  width: 156px;
  border-radius: var(--border-radius-m);
  text-align: center;
  padding: var(--space-m);
  text-decoration: none;
  color: inherit;
  transition: all 0.3s ease;

  &--clickable {
    cursor: pointer;
    border: 1px solid transparent;

    &:hover {
      transform: translateY(-2px);
      border-color: var(--color-accent-alpha);
      background: var(--color-bg-subtle);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);

      .hero-section__stats-value {
        color: var(--color-accent);
      }
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.hero-section__stats-value {
  display: block;
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: var(--space-xs);
}
</style>
