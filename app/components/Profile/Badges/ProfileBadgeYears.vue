<script setup lang="ts">
import { computed } from 'vue'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'

const props = defineProps<{
  years: number
  memberSince: string
  compact?: boolean
}>()

const variant = computed<BadgeVariant>(() => {
  if (props.years >= 20)
    return 'shiny'
  if (props.years >= 10)
    return 'gold'
  if (props.years >= 5)
    return 'silver'
  return 'bronze'
})

const displayYears = computed(() => Math.max(1, Math.floor(props.years)))

const subtitle = computed(() => {
  return `${displayYears.value} year${displayYears.value === 1 ? '' : 's'}`
})

const formattedSince = computed(() => {
  const date = new Date(props.memberSince)
  if (Number.isNaN(date.getTime()))
    return ''

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
})

const description = computed(() => {
  if (!formattedSince.value)
    return `Member for ${subtitle.value}`
  return `Member for ${subtitle.value} (since ${formattedSince.value})`
})
</script>

<template>
  <ProfileBadge
    label="One of Us"
    :description="description"
    icon="ph:calendar-blank"
    :variant="variant"
    :compact="props.compact"
  >
    <template #hex>
      <div class="profile-badge-years__value">
        <span class="profile-badge-years__years">{{ displayYears }}</span>
        <span class="profile-badge-years__unit">{{ displayYears > 1 ? 'years' : 'year' }}</span>
      </div>
    </template>
  </ProfileBadge>
</template>

<style scoped lang="scss">
.profile-badge-years__value {
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

.profile-badge-years__years {
  font-size: clamp(2.5rem, 8vw, 4.5rem);
  font-weight: var(--font-weight-bold, 700);
  line-height: 1;
}

.profile-badge-years__unit {
  font-size: 0.85rem;
  letter-spacing: 0.4em;
}
</style>
