<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  profile: Tables<'profiles'>
}

const props = defineProps<Props>()

// Format time since account creation
function getAccountAge(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - created.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }
  else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  else {
    const years = Math.floor(diffDays / 365)
    return `${years} year${years === 1 ? '' : 's'} ago`
  }
}

// Check if user has any achievements
const hasAchievements = computed(() => {
  return props.profile.supporter_lifetime
    || props.profile.supporter_patreon
    || getAccountAge(props.profile.created_at).includes('year')
})
</script>

<template>
  <Card separators class="achievements-section">
    <template #header>
      <Flex x-between y-center>
        <h3>Achievements</h3>
        <Icon name="ph:trophy" />
      </Flex>
    </template>

    <Flex gap="s" wrap extend x-center>
      <Tooltip v-if="profile.supporter_lifetime">
        <template #tooltip>
          <p>Contributed in a significant way to the community!</p>
        </template>
        <Badge variant="success" size="m">
          <Icon name="ph:crown-simple" />
          Lifetime Supporter
        </Badge>
      </Tooltip>

      <Tooltip v-if="profile.supporter_patreon">
        <template #tooltip>
          <p>Thank you for being an active supporter!</p>
        </template>
        <Badge variant="accent" size="m">
          <Icon name="ph:heart-fill" />
          Community Supporter
        </Badge>
      </Tooltip>

      <Tooltip v-if="getAccountAge(profile.created_at).includes('year')">
        <template #tooltip>
          <p>Been part of the community for over a year!</p>
        </template>
        <Badge variant="info" size="m">
          <Icon name="ph:cake" />
          Veteran Member
        </Badge>
      </Tooltip>

      <!-- Show a placeholder if no achievements -->
      <Flex v-if="!hasAchievements" column y-center x-center class="achievements-empty">
        <p class="color-text-lighter text-s">
          Achievements will appear here as you participate in the community!
        </p>
      </Flex>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.achievements-section {
  min-height: 600px;
}

.achievements-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-l);
  text-align: center;

  p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
}
</style>
