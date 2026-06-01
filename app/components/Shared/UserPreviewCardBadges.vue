<script setup lang="ts">
import type { UserDisplayData } from '@/composables/useDataUser'
import { Flex } from '@dolanske/vui'
import { computed } from 'vue'
import ProfileBadgeFromSlug from '@/components/Profile/Badges/ProfileBadgeFromSlug.vue'
import { useDataProfileBadges } from '@/composables/useDataProfileBadges'
import { BADGE_CATALOG, getBadgeMemberSince } from '@/lib/badges/catalog'

const props = defineProps<{
  user: UserDisplayData | null
  maxBadges: number
}>()

const profileId = computed(() => props.user?.id ?? null)
const { badges } = useDataProfileBadges(profileId)

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

const visibleBadges = computed(() => sortedBadges.value.slice(0, props.maxBadges))
const hasBadges = computed(() => sortedBadges.value.length > 0)
</script>

<template>
  <Flex v-if="hasBadges" :gap="0" role="list" aria-label="User badges" class="user-preview-card-badges">
    <Flex
      v-for="badge in visibleBadges"
      :key="`preview-card-badge-${badge.slug}`"
      class="user-preview-card-badges__item"
    >
      <ProfileBadgeFromSlug
        :slug="badge.slug"
        :tier="badge.tier"
        :progress="badge.progress ?? undefined"
        :earned-at="getBadgeMemberSince(badge.metadata, badge.earned_at)"
        compact
      />
    </Flex>
  </Flex>
</template>

<style scoped lang="scss">
.user-preview-card-badges {
  margin-right: -8px;
}

.user-preview-card-badges__item {
  min-width: 54px;
  max-width: 54px;
  min-height: 54px;
  max-height: 54px;
  margin-left: -16px;
  margin-top: -16px;
}

.user-preview-card-badges__badge {
  width: 100%;
}

.user-preview-card-badges__item :deep(.profile-badge-from-slug__years-number) {
  font-size: 1.6rem;
}

.user-preview-card-badges__item :deep(.profile-badge-from-slug__years-unit) {
  font-size: 0.55rem;
  letter-spacing: 0.25em;
}

.user-preview-card-badges__overflow {
  padding: 0 var(--space-xs);
  border-radius: var(--border-radius-pill);
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-light);
}
</style>
