<script setup lang="ts">
import type { Component } from 'vue'
import type { Enums, Tables } from '@/types/database.types'
import { Button, Card, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import ProfileBadgeBuilder from '@/components/Profile/Badges/ProfileBadgeBuilder.vue'
import ProfileBadgeDiscussionReplies from '@/components/Profile/Badges/ProfileBadgeDiscussionReplies.vue'
import ProfileBadgeDiscussionStarter from '@/components/Profile/Badges/ProfileBadgeDiscussionStarter.vue'
import ProfileBadgeEarlybird from '@/components/Profile/Badges/ProfileBadgeEarlybird.vue'
import ProfileBadgeFounder from '@/components/Profile/Badges/ProfileBadgeFounder.vue'
import ProfileBadgeRSVPs from '@/components/Profile/Badges/ProfileBadgeRSVPs.vue'
import ProfileBadgeSupporter from '@/components/Profile/Badges/ProfileBadgeSupporter.vue'
import ProfileBadgeSupporterLifetime from '@/components/Profile/Badges/ProfileBadgeSupporterLifetime.vue'
import ProfileBadgeYears from '@/components/Profile/Badges/ProfileBadgeYears.vue'
import { useCacheBadgeDiscussionReplyCount } from '@/composables/useCacheBadgeDiscussionReplyCount'
import { useCacheBadgeDiscussionStartedCount } from '@/composables/useCacheBadgeDiscussionStartedCount'
import { useCacheBadgePartyAnimalCount } from '@/composables/useCacheBadgePartyAnimalCount'
import { DISCUSSION_REPLY_MIN_COUNT, DISCUSSION_STARTER_MIN_COUNT, getDiscussionReplyVariant, getDiscussionStarterVariant } from '@/lib/discussionBadge'
import { getPartyAnimalVariant, PARTY_ANIMAL_MIN_RSVPS } from '@/lib/partyAnimalBadge'
import ProfileBadgeHost from './Badges/ProfileBadgeHost.vue'

interface Props {
  profile: Tables<'profiles'>
  isOwnProfile?: boolean
}

type ProfileBadgeSlug = Enums<'profile_badge'>
type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'

interface BadgeDefinition {
  id: string
  component: Component
  slug?: ProfileBadgeSlug
  isVisible?: () => boolean
}

interface RenderableBadgeEntry {
  id: string
  component: Component
  componentProps?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  isOwnProfile: false,
})

const badgeVariantOrder: BadgeVariant[] = ['shiny', 'gold', 'silver', 'bronze']

type BadgeDefinitionsByVariant = Record<BadgeVariant, BadgeDefinition[]>

// Reorder or extend these lists to control badge ordering (years badge handled separately below).
const badgeDefinitionsByVariant: BadgeDefinitionsByVariant = {
  shiny: [
    { id: 'founder', slug: 'founder', component: ProfileBadgeFounder },
  ],
  gold: [
    { id: 'supporter_lifetime', component: ProfileBadgeSupporterLifetime, isVisible: () => props.profile.supporter_lifetime },
    { id: 'supporter', component: ProfileBadgeSupporter, isVisible: () => props.profile.supporter_patreon },
    { id: 'earlybird', slug: 'earlybird', component: ProfileBadgeEarlybird },
  ],
  silver: [
    { id: 'host', slug: 'host', component: ProfileBadgeHost },
    { id: 'builder', slug: 'builder', component: ProfileBadgeBuilder },
  ],
  bronze: [],
}

const uniqueProfileBadges = computed<ProfileBadgeSlug[]>(() => {
  const rawBadges = props.profile.badges ?? []
  return Array.from(new Set(rawBadges)) as ProfileBadgeSlug[]
})

const YEARS_BADGE_THRESHOLD_DAYS = 365

function getDaysSince(dateString: string): number {
  const created = new Date(dateString)
  if (Number.isNaN(created.getTime()))
    return 0

  const now = new Date()
  const diffTime = now.getTime() - created.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

const memberDays = computed(() => getDaysSince(props.profile.created_at))
const memberYears = computed(() => Math.floor(memberDays.value / 365))
const hasYearsBadge = computed(() => memberYears.value >= 1 && memberDays.value >= YEARS_BADGE_THRESHOLD_DAYS)
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

const profileIdRef = computed(() => props.profile?.id ?? null)
const { count: PartyAnimalCount } = useCacheBadgePartyAnimalCount(profileIdRef)
const partyAnimalVariant = computed<BadgeVariant | null>(() => {
  const variant = getPartyAnimalVariant(PartyAnimalCount.value)
  return variant ?? null
})
const hasPartyAnimalBadge = computed(() => (partyAnimalVariant.value !== null) && PartyAnimalCount.value >= PARTY_ANIMAL_MIN_RSVPS)

const { count: DiscussionStartedCount } = useCacheBadgeDiscussionStartedCount(profileIdRef)
const discussionStarterVariant = computed<BadgeVariant | null>(() => {
  const variant = getDiscussionStarterVariant(DiscussionStartedCount.value)
  return variant ?? null
})
const hasDiscussionStarterBadge = computed(() => (discussionStarterVariant.value !== null) && DiscussionStartedCount.value >= DISCUSSION_STARTER_MIN_COUNT)

const { count: DiscussionReplyCount } = useCacheBadgeDiscussionReplyCount(profileIdRef)
const discussionReplyVariant = computed<BadgeVariant | null>(() => {
  const variant = getDiscussionReplyVariant(DiscussionReplyCount.value)
  return variant ?? null
})
const hasDiscussionReplyBadge = computed(() => (discussionReplyVariant.value !== null) && DiscussionReplyCount.value >= DISCUSSION_REPLY_MIN_COUNT)

const profileBadgesToRender = computed<RenderableBadgeEntry[]>(() => {
  const memberBadges = new Set(uniqueProfileBadges.value)
  const entries: RenderableBadgeEntry[] = []
  const currentYearsVariant = yearsBadgeVariant.value
  const currentPartyAnimalVariant = partyAnimalVariant.value
  const currentDiscussionStarterVariant = discussionStarterVariant.value
  const currentDiscussionReplyVariant = discussionReplyVariant.value

  badgeVariantOrder.forEach((variant) => {
    badgeDefinitionsByVariant[variant].forEach((definition) => {
      if (definition.slug && !memberBadges.has(definition.slug))
        return
      if (definition.isVisible && !definition.isVisible())
        return

      entries.push({
        id: definition.id,
        component: definition.component,
        componentProps: { compact: true },
      })
    })

    if (hasYearsBadge.value && currentYearsVariant === variant) {
      entries.push({
        id: 'years',
        component: ProfileBadgeYears,
        componentProps: {
          compact: true,
          years: memberYears.value,
          memberSince: props.profile.created_at,
        },
      })
    }

    if (hasPartyAnimalBadge.value && currentPartyAnimalVariant === variant) {
      entries.push({
        id: 'life_of_the_party',
        component: ProfileBadgeRSVPs,
        componentProps: {
          compact: true,
          rsvps: PartyAnimalCount.value,
        },
      })
    }

    if (hasDiscussionStarterBadge.value && currentDiscussionStarterVariant === variant) {
      entries.push({
        id: 'forum_regular',
        component: ProfileBadgeDiscussionStarter,
        componentProps: {
          compact: true,
          discussions: DiscussionStartedCount.value,
        },
      })
    }

    if (hasDiscussionReplyBadge.value && currentDiscussionReplyVariant === variant) {
      entries.push({
        id: 'chatterbox',
        component: ProfileBadgeDiscussionReplies,
        componentProps: {
          compact: true,
          replies: DiscussionReplyCount.value,
        },
      })
    }
  })

  return entries
})

const hasBadges = computed(() => profileBadgesToRender.value.length > 0)

const emptyStateText = computed(() => {
  if (props.isOwnProfile)
    return 'Earn badges by participating in the community!'
  return 'This member has not earned any badges yet.'
})

const goToBadgeDirectory = () => navigateTo('/community/badges')
</script>

<template>
  <Card separators class="badges-card card-bg">
    <template #header>
      <Flex x-between y-center>
        <Flex y-center gap="xs">
          <h4>Badges</h4>
          <!-- TODO: count how many badges -->
          <span class="counter">{{ profileBadgesToRender.length }}</span>
        </Flex>

        <Button size="s" variant="gray" aria-label="See all community badges" plain @click="goToBadgeDirectory">
          <template #start>
            <Icon name="ph:hexagon" />
          </template>
          Preview All
        </Button>
      </Flex>
    </template>

    <div v-if="hasBadges" class="badges-stack">
      <div
        v-for="badge in profileBadgesToRender"
        :key="`profile-badge-${badge.id}`"
        class="badges-stack__item"
      >
        <component :is="badge.component" v-bind="badge.componentProps ?? {}" />
      </div>
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

.badges-stack {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-m);
  width: 100%;
  // padding-block: var(--space-m) 0;
}

.badges-stack__item {
  width: 100%;
  display: flex;
  justify-content: center;
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
