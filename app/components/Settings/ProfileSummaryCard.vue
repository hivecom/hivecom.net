<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Avatar, Card, Flex, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useUserData } from '@/composables/useUserData'

interface Props {
  profile: Tables<'profiles'> | null
  userId: string | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const userIdRef = computed(() => props.userId)

const {
  user: userData,
  loading: userDataLoading,
  userInitials,
} = useUserData(userIdRef, {
  includeRole: true,
  includeAvatar: true,
})

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

function formatDate(dateString?: string | null) {
  if (!dateString)
    return 'Unknown'

  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return 'Unknown'

  return dateFormatter.format(parsed)
}

const summaryLoading = computed(() => props.loading || userDataLoading.value)
const hasProfile = computed(() => Boolean(props.profile))

const profileUsername = computed(() => userData.value?.username ?? props.profile?.username ?? null)
const profileLink = computed(() => profileUsername.value ? `/profile/${profileUsername.value}` : null)
const displayName = computed(() => profileUsername.value ?? 'Member')
const avatarUrl = computed(() => userData.value?.avatarUrl ?? null)
const role = computed(() => userData.value?.role ?? null)
const initials = computed(() => userInitials.value || displayName.value.charAt(0).toUpperCase())

const joinedDate = computed(() => formatDate(props.profile?.created_at))
const lastSeen = computed(() => formatDate(props.profile?.last_seen))
</script>

<template>
  <Card separators class="profile-summary-card">
    <template #header>
      <Flex x-between y-center>
        <div>
          <h3>Profile</h3>
        </div>
        <Icon name="ph:user" />
      </Flex>
    </template>

    <div v-if="summaryLoading" class="profile-summary-card__loading">
      <Flex gap="m" y-center>
        <Skeleton width="72px" height="72px" style="border-radius: 50%;" />
        <div class="profile-summary-card__loading-meta">
          <Skeleton width="120px" height="18px" style="margin-bottom: var(--space-xs);" />
          <Skeleton width="80px" height="16px" />
        </div>
      </Flex>
      <Flex gap="l" class="profile-summary-card__loading-stats">
        <Skeleton width="100px" height="32px" />
        <Skeleton width="100px" height="32px" />
        <Skeleton width="100px" height="32px" />
      </Flex>
    </div>

    <div v-else-if="!hasProfile" class="profile-summary-card__empty">
      <p class="text-color-lighter text-s">
        Profile information is unavailable.
      </p>
    </div>

    <Flex v-else column gap="m" class="profile-summary-card__content">
      <Flex gap="m" y-center wrap class="profile-summary-card__identity-row">
        <div class="profile-summary-card__avatar">
          <NuxtLink
            v-if="profileLink"
            :to="profileLink"
            class="profile-summary-card__avatar-link"
            :aria-label="`View profile for ${displayName}`"
          >
            <Avatar :size="128" :url="avatarUrl || undefined">
              <template v-if="!avatarUrl" #default>
                {{ initials }}
              </template>
            </Avatar>
          </NuxtLink>
          <Avatar v-else :size="128" :url="avatarUrl || undefined">
            <template v-if="!avatarUrl" #default>
              {{ initials }}
            </template>
          </Avatar>
        </div>

        <div class="profile-summary-card__identity">
          <Flex gap="s" y-center wrap>
            <h3>
              {{ displayName }}
            </h3>
            <RoleIndicator :role="role || 'member'" size="s" />
          </Flex>
          <p class="profile-summary-card__meta-line">
            Member since {{ joinedDate }} · Last active {{ lastSeen }}
          </p>
        </div>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped lang="scss">
.profile-summary-card {
  height: 100%;

  &__loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
  }

  &__loading-meta {
    flex: 1;
  }

  &__loading-stats {
    flex-wrap: wrap;
  }

  &__empty {
    padding: var(--space-s) 0;
    text-align: center;
  }

  &__content {
    gap: var(--space-m);
  }

  &__identity-row {
    align-items: center;
  }

  &__avatar-link {
    display: inline-flex;
    border-radius: 999px;
    transition: transform 0.2s ease;

    &:hover,
    &:focus-visible {
      transform: translateY(-1px) scale(1.02);
    }
  }

  &__identity {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }

  &__username {
    font-size: 1.25rem;
    font-weight: var(--font-weight-semibold);
    margin: 0;
  }

  &__meta-line {
    font-size: 0.9rem;
    color: var(--color-text-light);
    margin: 0;
  }

  &__stats {
    border-top: 1px solid var(--color-border-subtle);
    padding-top: var(--space-s);
  }

  &__stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    min-width: 140px;
  }

  &__stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-subtle);
  }

  &__stat-value {
    font-weight: var(--font-weight-medium);
  }
}
</style>
