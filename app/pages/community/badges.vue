<script setup lang="ts">
import { Card, Flex } from '@dolanske/vui'
import ProfileBadgeBuilder from '@/components/Profile/Badges/ProfileBadgeBuilder.vue'
import ProfileBadgeEarlybird from '@/components/Profile/Badges/ProfileBadgeEarlybird.vue'
import ProfileBadgeFounder from '@/components/Profile/Badges/ProfileBadgeFounder.vue'
import ProfileBadgeHost from '@/components/Profile/Badges/ProfileBadgeHost.vue'
import ProfileBadgeRSVPs from '@/components/Profile/Badges/ProfileBadgeRSVPs.vue'
import ProfileBadgeSupporter from '@/components/Profile/Badges/ProfileBadgeSupporter.vue'
import ProfileBadgeSupporterLifetime from '@/components/Profile/Badges/ProfileBadgeSupporterLifetime.vue'
import ProfileBadgeYears from '@/components/Profile/Badges/ProfileBadgeYears.vue'

function memberSinceYearsAgo(years: number) {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return date.toISOString()
}

const membershipSnapshots = [1, 5, 10, 20].map(years => ({
  years,
  memberSince: memberSinceYearsAgo(years),
}))

useSeoMeta({
  title: 'Badges',
  description: 'Explore the badges available in the Hivecom community.',
  ogTitle: 'Badges',
  ogDescription: 'Explore the badges available in the Hivecom community.',
})
</script>

<template>
  <div class="badges-playground page">
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
          <div class="badge-preview">
            <ProfileBadgeRSVPs :rsvps="12" />
          </div>
          <div class="badge-preview">
            <ProfileBadgeHost />
          </div>
          <div class="badge-preview">
            <ProfileBadgeBuilder />
          </div>
          <div class="badge-preview">
            <ProfileBadgeEarlybird />
          </div>
          <div class="badge-preview">
            <ProfileBadgeSupporter />
          </div>
          <div class="badge-preview">
            <ProfileBadgeSupporterLifetime />
          </div>
          <div class="badge-preview">
            <ProfileBadgeFounder />
          </div>
        </div>
      </Card>
    </section>

    <section class="playground-section">
      <Flex class="section-heading" column gap="xxs">
        <h2>Membership Years</h2>
        <p>These badges represent the length of time a member has been part of the community.</p>
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
