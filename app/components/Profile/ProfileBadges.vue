<script setup lang="ts">
import { Button, Card, Flex, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import ProfileBadgeFromSlug from '@/components/Profile/Badges/ProfileBadgeFromSlug.vue'
import { useDataProfileBadges } from '@/composables/useDataProfileBadges'
import { BADGE_CATALOG } from '@/lib/badges/catalog'

interface Props {
  profileId: string
  isOwnProfile?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isOwnProfile: false,
})

const profileIdRef = computed(() => props.profileId)
const { badges, loading } = useDataProfileBadges(profileIdRef)

// Sort: tier rank first (shiny > gold > silver > bronze), then catalog sortOrder within same tier
const TIER_RANK: Record<string, number> = { shiny: 0, gold: 1, silver: 2, bronze: 3 }

const sortedBadges = computed(() => {
  return [...badges.value].sort((a, b) => {
    const tierDiff = (TIER_RANK[a.tier] ?? 99) - (TIER_RANK[b.tier] ?? 99)
    if (tierDiff !== 0)
      return tierDiff
    const aOrder = BADGE_CATALOG[a.slug as keyof typeof BADGE_CATALOG]?.sortOrder ?? 99
    const bOrder = BADGE_CATALOG[b.slug as keyof typeof BADGE_CATALOG]?.sortOrder ?? 99
    return aOrder - bOrder
  })
})

const hasBadges = computed(() => sortedBadges.value.length > 0)

const emptyStateText = computed(() => {
  if (props.isOwnProfile)
    return 'Earn badges by participating in the community!'
  return 'This user has not earned any badges yet.'
})

const goToBadgeDirectory = () => navigateTo('/community/badges')
</script>

<template>
  <Card separators class="badges-card card-bg">
    <template #header>
      <Flex x-between y-center>
        <Flex y-center gap="xs">
          <h4>Badges</h4>
          <span v-if="!loading" class="counter">{{ sortedBadges.length }}</span>
        </Flex>

        <Button size="s" variant="gray" aria-label="See all community badges" plain @click="goToBadgeDirectory">
          <template #start>
            <Icon name="ph:hexagon" />
          </template>
          Preview All
        </Button>
      </Flex>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="badges-skeleton__grid">
      <Skeleton v-for="i in 4" :key="`badge-skeleton-${i}`" height="150px" width="100%" style="border-radius: var(--border-radius-m);" />
    </div>

    <div v-else-if="hasBadges" class="badges-stack">
      <Flex
        v-for="badge in sortedBadges"
        :key="`profile-badge-${badge.slug}`"
        x-center
      >
        <ProfileBadgeFromSlug
          :slug="badge.slug"
          :tier="badge.tier"
          :progress="badge.progress ?? undefined"
          :earned-at="badge.earned_at"
          compact
        />
      </Flex>
    </div>

    <Flex v-else column y-center x-center class="badges-empty">
      <Icon name="ph:hexagon" size="56" />
      <p class="text-color-lighter text-s">
        {{ emptyStateText }}
      </p>
    </Flex>

    <svg
      class="profile-badges-filter-defs"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
    >
      <defs>
        <filter id="profile-badge-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  </Card>

  <!--
    Filter adapted from Temani Afif's StackOverflow answer (CC BY-SA 4.0).
    Source: https://stackoverflow.com/a/76118647
  -->
  <!-- NOTE: Jan, seemingly this does not do anything and is causing a space in the flex layout. Btw the stack overflow souce leads to some azure fix, not svg -->
</template>

<style lang="scss" scoped>
.profile-badges-filter-defs {
  position: absolute;
}

.badges-card {
  // min-height: 360px;
  overflow: hidden;
}

.badges-stack,
.badges-skeleton__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-m);
  width: 100%;
}

.badges-empty {
  min-height: 260px;
  text-align: center;
  gap: var(--space-m);

  p {
    margin: 0;
    max-width: 420px;
  }
}

@media (max-width: 768px) {
  .badges-stack {
    gap: var(--space-l);
  }
}
</style>
