<script setup lang="ts">
import { Card, Flex } from '@dolanske/vui'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'
import ProfileBadgeBuilder from '@/components/Profile/Badges/ProfileBadgeBuilder.vue'
import ProfileBadgeEarlybird from '@/components/Profile/Badges/ProfileBadgeEarlybird.vue'
import ProfileBadgeFounder from '@/components/Profile/Badges/ProfileBadgeFounder.vue'
import ProfileBadgeHost from '@/components/Profile/Badges/ProfileBadgeHost.vue'
import ProfileBadgeLifetime from '@/components/Profile/Badges/ProfileBadgeLifetime.vue'
import ProfileBadgeYears from '@/components/Profile/Badges/ProfileBadgeYears.vue'

type BadgeVariant = 'bronze' | 'silver' | 'gold' | 'shiny'

interface PlaygroundBadge {
  label: string
  description: string
  variant: BadgeVariant
  icon: string
}

const baseBadges: PlaygroundBadge[] = [
  {
    label: 'Bronze',
    description: 'Baseline copper finish.',
    variant: 'bronze',
    icon: 'ph:medal',
  },
  {
    label: 'Silver',
    description: 'Cool-toned silver palette.',
    variant: 'silver',
    icon: 'ph:shield',
  },
  {
    label: 'Gold',
    description: 'Premium gold surface.',
    variant: 'gold',
    icon: 'ph:star-four',
  },
  {
    label: 'Opal',
    description: 'Opal/shiny material.',
    variant: 'shiny',
    icon: 'ph:sketch-logo',
  },
]

function memberSinceYearsAgo(years: number) {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return date.toISOString()
}

const membershipSnapshots = [1, 3, 7, 13].map(years => ({
  years,
  memberSince: memberSinceYearsAgo(years),
}))
</script>

<template>
  <div class="badges-playground page">
    <section class="page-title">
      <div>
        <h1>Badge Playground</h1>
        <p>Use this sandbox to test iconography, descriptions, and materials.</p>
      </div>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Material Variants</h2>
        <p>Swap icons/labels to confirm sizing and pointer interaction per surface.</p>
      </Flex>
      <Card class="playground-card">
        <div class="badge-grid">
          <div v-for="badge in baseBadges" :key="badge.label" class="badge-preview">
            <ProfileBadge
              :label="badge.label"
              :description="badge.description"
              :icon="badge.icon"
              :variant="badge.variant"
            />
          </div>
        </div>
      </Card>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Preset Badges</h2>
        <p>Ready-made badge components wired to the latest copy and icons.</p>
      </Flex>
      <Card class="playground-card">
        <div class="badge-grid">
          <div class="badge-preview">
            <ProfileBadgeEarlybird />
          </div>
          <div class="badge-preview">
            <ProfileBadgeLifetime />
          </div>
          <div class="badge-preview">
            <ProfileBadgeFounder />
          </div>
          <div class="badge-preview">
            <ProfileBadgeHost />
          </div>
          <div class="badge-preview">
            <ProfileBadgeBuilder />
          </div>
        </div>
      </Card>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Membership Years</h2>
        <p>Visualize the "One of Us" badge tiers for different member ages.</p>
      </Flex>
      <Card class="playground-card">
        <div class="badge-grid">
          <div
            v-for="snapshot in membershipSnapshots"
            :key="snapshot.years"
            class="badge-preview"
          >
            <ProfileBadgeYears
              :years="snapshot.years"
              :member-since="snapshot.memberSince"
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
