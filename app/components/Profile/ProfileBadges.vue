<script setup lang="ts">
import type { Component } from 'vue'
import type { Enums, Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import ProfileBadgeBuilder from '@/components/Profile/Badges/ProfileBadgeBuilder.vue'
import ProfileBadgeEarlybird from '@/components/Profile/Badges/ProfileBadgeEarlybird.vue'
import ProfileBadgeFounder from '@/components/Profile/Badges/ProfileBadgeFounder.vue'
import ProfileBadgeLifetime from '@/components/Profile/Badges/ProfileBadgeLifetime.vue'
import ProfileBadgeYears from '@/components/Profile/Badges/ProfileBadgeYears.vue'
import ProfileBadgeHost from './Badges/ProfileBadgeHost.vue'

interface Props {
  profile: Tables<'profiles'>
}

type ProfileBadgeSlug = Enums<'profile_badge'>

const props = defineProps<Props>()

const badgeComponentMap: Record<ProfileBadgeSlug, Component> = {
  builder: ProfileBadgeBuilder,
  earlybird: ProfileBadgeEarlybird,
  founder: ProfileBadgeFounder,
  host: ProfileBadgeHost,
}

const uniqueProfileBadges = computed<ProfileBadgeSlug[]>(() => {
  const rawBadges = props.profile.badges ?? []
  return Array.from(new Set(rawBadges)) as ProfileBadgeSlug[]
})

const profileBadgesToRender = computed(() =>
  uniqueProfileBadges.value
    .map((slug) => {
      const component = badgeComponentMap[slug]
      if (!component)
        return null
      return { slug, component }
    })
    .filter((entry): entry is { slug: ProfileBadgeSlug, component: Component } => !!entry),
)

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

const hasBadges = computed(() => {
  return profileBadgesToRender.value.length > 0
    || props.profile.supporter_lifetime
    || props.profile.supporter_patreon
    || hasYearsBadge.value
})
</script>

<template>
  <Card separators class="badges-card">
    <template #header>
      <Flex x-between y-center>
        <h3>Badges</h3>
        <Icon name="ph:hexagon" />
      </Flex>
    </template>

    <div v-if="hasBadges" class="badges-stack">
      <div v-if="profile.supporter_lifetime" class="badges-stack__item">
        <ProfileBadgeLifetime />
      </div>

      <div
        v-for="badge in profileBadgesToRender"
        :key="`profile-badge-${badge.slug}`"
        class="badges-stack__item"
      >
        <component :is="badge.component" />
      </div>

      <div v-if="profile.supporter_patreon" class="badges-stack__item">
        <ProfileBadgePatreon />
      </div>

      <div v-if="hasYearsBadge" class="badges-stack__item">
        <ProfileBadgeYears
          :years="memberYears"
          :member-since="profile.created_at"
        />
      </div>
    </div>

    <Flex v-else column y-center x-center class="badges-empty">
      <Icon name="ph:hexagon" size="56" />
      <p class="text-color-lighter text-s">
        Badges will appear here as you participate in the community!
      </p>
    </Flex>
  </Card>

  <!--
    Filter adapted from Temani Afif's StackOverflow answer (CC BY-SA 4.0).
    Source: https://stackoverflow.com/a/76118647
  -->
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
</template>

<style lang="scss" scoped>
.badges-card {
  min-height: 360px;
}

.badges-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  width: 100%;
  padding: var(--space-l) 0;
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
