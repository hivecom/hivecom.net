<script setup lang="ts">
import type { BadgeVariant } from '@/lib/badges/catalog'
import { Card, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import ProfileBadgeFromSlug from '@/components/Profile/Badges/ProfileBadgeFromSlug.vue'
import { BADGE_CATALOG, BADGE_VARIANT_ORDER } from '@/lib/badges/catalog'

// useSeoMeta / defineOgImage are Nuxt auto-imports - no explicit import needed

// Build preview entries for computed badges: one entry per defined tier threshold
interface BadgePreviewEntry {
  slug: string
  tier: BadgeVariant
  progress: number
  earnedAt?: string
}

function memberSinceYearsAgo(years: number): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return date.toISOString()
}

// Special recognition: manual + flag badges, shown at their defaultTier
const specialBadges = computed(() =>
  Object.entries(BADGE_CATALOG)
    .filter(([, entry]) => entry.kind === 'manual' || entry.kind === 'flag')
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
    .map(([slug, entry]) => ({
      slug,
      tier: (entry as { defaultTier: BadgeVariant }).defaultTier,
    })),
)

// Community participation: computed badges with unit rsvps/discussions/replies
// Show all defined tiers from lowest to highest
const participationBadges = computed((): BadgePreviewEntry[] => {
  const result: BadgePreviewEntry[] = []
  const participationSlugs = Object.entries(BADGE_CATALOG)
    .filter(([, e]) => e.kind === 'computed' && (e as { unit: string }).unit !== 'years')
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)

  for (const [slug, entry] of participationSlugs) {
    if (entry.kind !== 'computed')
      continue
    const tiers = entry.tiers as Partial<Record<BadgeVariant, number>>
    // Iterate from lowest tier to highest for display order
    for (const tier of [...BADGE_VARIANT_ORDER].reverse()) {
      const threshold = tiers[tier]
      if (threshold !== undefined) {
        result.push({ slug, tier, progress: threshold })
      }
    }
  }
  return result
})

// Years badges: one_of_us at each defined tier
const yearsBadges = computed((): BadgePreviewEntry[] => {
  const entry = BADGE_CATALOG.one_of_us
  const tiers = entry.tiers as Partial<Record<BadgeVariant, number>>
  return [...BADGE_VARIANT_ORDER]
    .filter(tier => tiers[tier] !== undefined)
    .map(tier => ({
      slug: 'one_of_us',
      tier,
      progress: tiers[tier]!,
      earnedAt: memberSinceYearsAgo(tiers[tier]!),
    }))
    .reverse() // bronze first, shiny last for ascending display
})

useSeoMeta({
  title: 'Badges',
  description: 'Explore the badges available in the Hivecom community.',
  ogTitle: 'Badges',
  ogDescription: 'Explore the badges available in the Hivecom community.',
})

defineOgImage('Default', {
  title: 'Badges',
  description: 'Explore the badges available in the Hivecom community.',
})
</script>

<template>
  <div class="badges-playground page container-l">
    <section class="page-title">
      <div>
        <h1>Badges</h1>
        <p>These are all the badges available in the community.</p>
      </div>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Special Recognition</h2>
        <p>These badges recognize special contributions and statuses within the community.</p>
      </Flex>
      <Card class="playground-card">
        <div class="badge-grid">
          <div
            v-for="badge in specialBadges"
            :key="badge.slug"
            class="badge-preview"
          >
            <ProfileBadgeFromSlug :slug="badge.slug" :tier="badge.tier" />
          </div>
        </div>
      </Card>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Community Participation</h2>
        <p>These badges are earned by actively participating in events and conversations.</p>
      </Flex>
      <Card class="playground-card">
        <div class="badge-grid">
          <div
            v-for="badge in participationBadges"
            :key="`${badge.slug}-${badge.tier}`"
            class="badge-preview"
          >
            <ProfileBadgeFromSlug
              :slug="badge.slug"
              :tier="badge.tier"
              :progress="badge.progress"
            />
          </div>
        </div>
      </Card>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Community Years</h2>
        <p>These badges represent the length of time a user has been part of the community.</p>
      </Flex>
      <Card class="playground-card">
        <div class="badge-grid">
          <div
            v-for="badge in yearsBadges"
            :key="`${badge.slug}-${badge.tier}`"
            class="badge-preview"
          >
            <ProfileBadgeFromSlug
              :slug="badge.slug"
              :tier="badge.tier"
              :progress="badge.progress"
              :earned-at="badge.earnedAt"
            />
          </div>
        </div>
      </Card>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.badges-playground {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding-bottom: var(--space-xxl);
}

.playground-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.section-heading {
  h2 {
    font-size: clamp(1.5rem, 1.2rem + 1vw, 2rem);
    margin: 0;
  }

  p {
    color: var(--color-text-muted);
    margin: 0;
  }
}

.playground-card {
  padding: var(--space-l);
}

.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-xl);
}

.badge-preview {
  display: flex;
  flex-direction: column;
  text-align: center;
}

@media screen and (max-width: $breakpoint-m) {
  .playground-card {
    padding: var(--space-m);
  }
}
</style>
