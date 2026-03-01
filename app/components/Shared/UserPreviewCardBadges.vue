<script setup lang="ts">
import type { Component } from 'vue'
import type { UserDisplayData } from '@/composables/useCacheUserData'
import type { Enums } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import { computed } from 'vue'
import ProfileBadgeBuilder from '@/components/Profile/Badges/ProfileBadgeBuilder.vue'
import ProfileBadgeDiscussionReplies from '@/components/Profile/Badges/ProfileBadgeDiscussionReplies.vue'
import ProfileBadgeDiscussionStarter from '@/components/Profile/Badges/ProfileBadgeDiscussionStarter.vue'
import ProfileBadgeEarlybird from '@/components/Profile/Badges/ProfileBadgeEarlybird.vue'
import ProfileBadgeFounder from '@/components/Profile/Badges/ProfileBadgeFounder.vue'
import ProfileBadgeHost from '@/components/Profile/Badges/ProfileBadgeHost.vue'
import ProfileBadgeRSVPs from '@/components/Profile/Badges/ProfileBadgeRSVPs.vue'
import ProfileBadgeSupporter from '@/components/Profile/Badges/ProfileBadgeSupporter.vue'
import ProfileBadgeSupporterLifetime from '@/components/Profile/Badges/ProfileBadgeSupporterLifetime.vue'
import ProfileBadgeYears from '@/components/Profile/Badges/ProfileBadgeYears.vue'
import { useCacheBadgeDiscussionReplyCount } from '@/composables/useCacheBadgeDiscussionReplyCount'
import { useCacheBadgeDiscussionStartedCount } from '@/composables/useCacheBadgeDiscussionStartedCount'
import { useCacheBadgePartyAnimalCount } from '@/composables/useCacheBadgePartyAnimalCount'
import { DISCUSSION_REPLY_MIN_COUNT, DISCUSSION_STARTER_MIN_COUNT, getDiscussionReplyVariant, getDiscussionStarterVariant } from '@/lib/discussionBadge'
import { getPartyAnimalVariant, PARTY_ANIMAL_MIN_RSVPS } from '@/lib/partyAnimalBadge'

const props = defineProps<{
  user: UserDisplayData | null
  maxBadges: number
}>()

type ProfileBadgeSlug = Enums<'profile_badge'>
type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'

interface BadgeDefinition {
  id: string
  component: Component
  slug?: ProfileBadgeSlug
  isVisible?: (user: UserDisplayData | null) => boolean
}

interface RenderableBadgeEntry {
  id: string
  component: Component
  componentProps?: Record<string, unknown>
}

type BadgeDefinitionsByVariant = Record<BadgeVariant, BadgeDefinition[]>

const badgeVariantOrder: BadgeVariant[] = ['shiny', 'gold', 'silver', 'bronze']

const badgeDefinitionsByVariant: BadgeDefinitionsByVariant = {
  shiny: [
    { id: 'founder', slug: 'founder', component: ProfileBadgeFounder },
  ],
  gold: [
    { id: 'supporter_lifetime', component: ProfileBadgeSupporterLifetime, isVisible: user => Boolean(user?.supporter_lifetime) },
    { id: 'supporter', component: ProfileBadgeSupporter, isVisible: user => Boolean(user?.supporter_patreon) },
    { id: 'earlybird', slug: 'earlybird', component: ProfileBadgeEarlybird },
  ],
  silver: [
    { id: 'host', slug: 'host', component: ProfileBadgeHost },
    { id: 'builder', slug: 'builder', component: ProfileBadgeBuilder },
  ],
  bronze: [],
}

const previewedUserId = computed(() => props.user?.id ?? null)
const { count: PartyAnimalCount } = useCacheBadgePartyAnimalCount(previewedUserId)
const partyAnimalVariant = computed<BadgeVariant | null>(() => {
  const variant = getPartyAnimalVariant(PartyAnimalCount.value)
  return variant ?? null
})
const hasPartyAnimalBadge = computed(() => (partyAnimalVariant.value !== null) && PartyAnimalCount.value >= PARTY_ANIMAL_MIN_RSVPS)

const { count: DiscussionStartedCount } = useCacheBadgeDiscussionStartedCount(previewedUserId)
const discussionStarterVariant = computed<BadgeVariant | null>(() => {
  const variant = getDiscussionStarterVariant(DiscussionStartedCount.value)
  return variant ?? null
})
const hasDiscussionStarterBadge = computed(() => (discussionStarterVariant.value !== null) && DiscussionStartedCount.value >= DISCUSSION_STARTER_MIN_COUNT)

const { count: DiscussionReplyCount } = useCacheBadgeDiscussionReplyCount(previewedUserId)
const discussionReplyVariant = computed<BadgeVariant | null>(() => {
  const variant = getDiscussionReplyVariant(DiscussionReplyCount.value)
  return variant ?? null
})
const hasDiscussionReplyBadge = computed(() => (discussionReplyVariant.value !== null) && DiscussionReplyCount.value >= DISCUSSION_REPLY_MIN_COUNT)

function getDaysSince(dateString: string | null | undefined): number {
  if (!dateString)
    return 0

  const created = new Date(dateString)
  if (Number.isNaN(created.getTime()))
    return 0

  const now = new Date()
  const diffTime = now.getTime() - created.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

const memberDays = computed(() => getDaysSince(props.user?.created_at))
const memberYears = computed(() => Math.floor(memberDays.value / 365))
const hasYearsBadge = computed(() => memberYears.value >= 1 && memberDays.value >= 365)
const yearsBadgeVariant = computed<BadgeVariant | null>(() => {
  if (!hasYearsBadge.value)
    return null

  if (memberYears.value >= 20)
    return 'shiny'
  if (memberYears.value >= 10)
    return 'gold'
  if (memberYears.value >= 5)
    return 'silver'
  return 'bronze'
})

const uniqueProfileBadges = computed(() => {
  const rawBadges = props.user?.badges ?? []
  return new Set(rawBadges)
})

const badgeEntries = computed<RenderableBadgeEntry[]>(() => {
  if (!props.user)
    return []

  const memberBadges = new Set(uniqueProfileBadges.value)
  const entries: RenderableBadgeEntry[] = []

  badgeVariantOrder.forEach((variant) => {
    badgeDefinitionsByVariant[variant].forEach((definition) => {
      if (definition.slug && !memberBadges.has(definition.slug))
        return
      if (definition.isVisible && !definition.isVisible(props.user))
        return

      entries.push({
        id: definition.id,
        component: definition.component,
        componentProps: {
          compact: true,
        },
      })
    })

    if (hasYearsBadge.value && yearsBadgeVariant.value === variant) {
      entries.push({
        id: 'years',
        component: ProfileBadgeYears,
        componentProps: {
          years: memberYears.value,
          memberSince: props.user?.created_at ?? new Date().toISOString(),
          compact: true,
        },
      })
    }

    if (hasPartyAnimalBadge.value && partyAnimalVariant.value === variant) {
      entries.push({
        id: 'life_of_the_party',
        component: ProfileBadgeRSVPs,
        componentProps: {
          rsvps: PartyAnimalCount.value,
          compact: true,
        },
      })
    }

    if (hasDiscussionStarterBadge.value && discussionStarterVariant.value === variant) {
      entries.push({
        id: 'forum_regular',
        component: ProfileBadgeDiscussionStarter,
        componentProps: {
          discussions: DiscussionStartedCount.value,
          compact: true,
        },
      })
    }

    if (hasDiscussionReplyBadge.value && discussionReplyVariant.value === variant) {
      entries.push({
        id: 'chatterbox',
        component: ProfileBadgeDiscussionReplies,
        componentProps: {
          replies: DiscussionReplyCount.value,
          compact: true,
        },
      })
    }
  })

  return entries
})

const visibleBadges = computed(() => badgeEntries.value.slice(0, props.maxBadges))
const hasBadges = computed(() => badgeEntries.value.length > 0)
</script>

<template>
  <Flex v-if="hasBadges" :gap="0" role="list" aria-label="User badges" class="user-preview-card-badges">
    <Flex
      v-for="badge in visibleBadges"
      :key="`preview-card-badge-${badge.id}`"
      class="user-preview-card-badges__item"
    >
      <component
        :is="badge.component"
        v-bind="badge.componentProps ?? {}"
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

.user-preview-card-badges__item :deep(.profile-badge-years__years) {
  font-size: 1.6rem;
}

.user-preview-card-badges__item :deep(.profile-badge-years__unit) {
  font-size: 0.55rem;
  letter-spacing: 0.25em;
}

.user-preview-card-badges__overflow {
  padding: 0 var(--space-xs);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-light);
}
</style>
