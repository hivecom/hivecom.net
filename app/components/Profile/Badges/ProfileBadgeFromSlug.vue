<script setup lang="ts">
import type { BadgeVariant } from '@/lib/badges/catalog'
import { computed } from 'vue'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'
import { BADGE_CATALOG } from '@/lib/badges/catalog'

/**
 * Generic badge renderer driven by a slug + tier + optional progress.
 * Used by both the catalog preview page (step 2) and profile badge rows (step 3).
 *
 * For the "one_of_us" badge, pass `progress` = years and `earnedAt` = join date ISO string
 * to get the hex number display and "since" description.
 */
const props = withDefaults(defineProps<{
  slug: string
  tier?: BadgeVariant
  /** Numeric progress value (count or years) for computed badges. */
  progress?: number | null
  /** ISO date string used for "member since" description on one_of_us. */
  earnedAt?: string | null
  compact?: boolean
}>(), {
  tier: undefined,
  progress: null,
  earnedAt: null,
  compact: false,
})

const entry = computed(() => {
  const e = BADGE_CATALOG[props.slug as keyof typeof BADGE_CATALOG]
  return e ?? null
})

const resolvedTier = computed<BadgeVariant>(() => {
  if (props.tier)
    return props.tier
  if (entry.value && entry.value.kind !== 'computed')
    return entry.value.defaultTier
  return 'bronze'
})

const label = computed(() => entry.value?.label ?? props.slug)
const icon = computed(() => entry.value?.icon ?? 'ph:hexagon')

const description = computed(() => {
  if (!entry.value)
    return undefined

  const e = entry.value
  const progress = props.progress ?? 0

  if (e.kind === 'computed') {
    const { unit } = e
    if (unit === 'years') {
      const years = Math.max(1, Math.floor(progress))
      const yearWord = `${years} year${years === 1 ? '' : 's'}`
      if (props.earnedAt) {
        const date = new Date(props.earnedAt)
        if (!Number.isNaN(date.getTime())) {
          const formatted = new Intl.DateTimeFormat('en', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(date)
          return `User for ${yearWord} (since ${formatted})`
        }
      }
      return `User for ${yearWord}`
    }
    if (unit === 'rsvps')
      return `RSVP'd "Yes" to ${progress} event${progress === 1 ? '' : 's'}.`
    if (unit === 'discussions')
      return `Started ${progress} forum discussion${progress === 1 ? '' : 's'}.`
    if (unit === 'replies')
      return `Posted ${progress} discussion repl${progress === 1 ? 'y' : 'ies'}.`
    if (unit === 'replies_received')
      return `Received ${progress} repl${progress === 1 ? 'y' : 'ies'} from others on their profile wall.`
  }

  return e.description
})

const showsProgressInHex = computed(() =>
  entry.value?.kind === 'computed' && (entry.value as { hexShowsProgress?: boolean }).hexShowsProgress === true,
)

const displayYears = computed(() => Math.max(1, Math.floor(props.progress ?? 0)))
</script>

<template>
  <ProfileBadge
    :label="label"
    :description="description"
    :icon="icon"
    :variant="resolvedTier"
    :compact="props.compact"
  >
    <template v-if="showsProgressInHex" #hex>
      <div class="profile-badge-from-slug__years-value">
        <span class="profile-badge-from-slug__years-number">{{ displayYears }}</span>
        <span class="profile-badge-from-slug__years-unit">{{ displayYears > 1 ? 'years' : 'year' }}</span>
      </div>
    </template>
  </ProfileBadge>
</template>

<style scoped lang="scss">
.profile-badge-from-slug__years-value {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--badge-icon-color);
  text-transform: uppercase;
  cursor: default;
  text-select: none;
}

.profile-badge-from-slug__years-number {
  font-size: clamp(2.5rem, 8vw, 4.5rem);
  font-weight: var(--font-weight-bold, 700);
  line-height: 1;
}

.profile-badge-from-slug__years-unit {
  font-size: 0.85rem;
  letter-spacing: 0.4em;
}
</style>
