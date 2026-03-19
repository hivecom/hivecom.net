<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Avatar, Button, Divider, Flex } from '@dolanske/vui'
import { computed, toRef } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import UserPreviewCardBadges from '@/components/Shared/UserPreviewCardBadges.vue'
import { useCachedFetch } from '@/composables/useCache'
import { useDataUser } from '@/composables/useDataUser'
import { getCountryInfo } from '@/lib/utils/country'
import ActivitySteam from '../Profile/Activity/ActivitySteam.vue'
import ActivityTeamspeak from '../Profile/Activity/ActivityTeamspeak.vue'

interface Props {
  userId: string | null | undefined
  showBadges?: boolean
  showActivity?: boolean
  maxBadges?: number
  avatarSize?: 's' | 'm' | 'l' | number
}

const props = withDefaults(defineProps<Props>(), {
  showBadges: true,
  showActivity: true,
  maxBadges: 4,
  avatarSize: 88,
})

const userIdRef = toRef(props, 'userId')

const {
  user,
  loading,
  error,
  userInitials,
  refetch,
} = useDataUser(userIdRef, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

const profileLink = computed(() => {
  if (!user.value)
    return null

  const identifier = user.value.username || user.value.id
  return `/profile/${identifier}`
})

const introductionText = computed(() => {
  const intro = user.value?.introduction?.trim()
  if (!intro)
    return
  if (intro.length > 160)
    return `${intro.slice(0, 157)}…`
  return intro
})

const hasCustomIntroduction = computed(() => Boolean(user.value?.introduction?.trim()))

const memberSince = computed(() => {
  const createdAt = user.value?.created_at
  if (!createdAt)
    return null

  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime()))
    return null

  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(created)
})

const countryInfo = computed(() => {
  if (!user.value?.country)
    return null

  return getCountryInfo(user.value.country)
})

function handleRetry() {
  void refetch()
}

const currentUser = useSupabaseUser()

// When unauthenticated, a missing profile is expected (RLS only returns public
// profiles to anon). Don't show an error — just render nothing.
const isExpectedEmpty = computed(() =>
  !currentUser.value && (!!error.value || !user.value),
)

// Activity data
const {
  data: activity,
} = useCachedFetch<{
  steam_id: string | null
  teamspeak_identities: Tables<'profiles'>['teamspeak_identities'] | TeamSpeakIdentityRecord[] | null
}>(
  () => props.userId
    ? {
        table: 'profiles',
        select: 'steam_id,teamspeak_identities',
        filters: { id: props.userId },
        single: true,
      }
    : null,
  {
    enabled: computed(() => !!props.userId),
  },
)
</script>

<template>
  <div v-if="!loading" class="user-preview-card">
    <div v-if="!props.userId" class="user-preview-card__state text-center text-color-light">
      <p>Select a user to preview.</p>
    </div>

    <template v-else-if="isExpectedEmpty" />

    <Flex v-else-if="error || !user" column y-center gap="s" class="user-preview-card__state text-center text-color-light">
      <p>{{ error ?? 'We could not load this profile right now.' }}</p>
      <Button size="s" variant="gray" @click="handleRetry">
        Retry
      </Button>
    </Flex>

    <Flex v-else column :gap="0">
      <Flex expand x-between class="user-preview-card__header">
        <Flex>
          <NuxtLink
            v-if="profileLink"
            :to="profileLink"
            class="user-preview-card__avatar-link"
            :aria-label="`View profile of ${user.username}`"
          >
            <Avatar class="user-preview-card__avatar" :size="props.avatarSize" :url="user.avatarUrl || undefined">
              <template v-if="!user.avatarUrl" #default>
                {{ userInitials }}
              </template>
            </Avatar>
          </NuxtLink>
          <Avatar
            v-else
            :size="props.avatarSize"
            :url="user.avatarUrl || undefined"
          >
            <template v-if="!user.avatarUrl" #default>
              {{ userInitials }}
            </template>
          </Avatar>
        </Flex>

        <UserPreviewCardBadges
          v-if="props.showBadges"
          class="user-preview-card__badges"
          :user="user"
          :max-badges="3"
        />
      </Flex>

      <Flex column gap="xs" class="user-preview-card__identity">
        <Flex y-center wrap>
          <NuxtLink
            v-if="profileLink"
            :to="profileLink"
            class="user-preview-card__name"
          >
            {{ user.username }}
          </NuxtLink>
          <span v-else class="user-preview-card__name">
            {{ user.username }}
          </span>
          <RoleIndicator v-if="user.role" :role="user.role" size="s" />
        </Flex>

        <Flex expand x-between>
          <p v-if="memberSince" class="user-preview-card__meta text-xs">
            Member since {{ memberSince }}
          </p>
          <p v-if="countryInfo" class="user-preview-card__meta text-xs">
            {{ countryInfo.name }} {{ countryInfo.emoji }}
          </p>
        </Flex>
      </Flex>

      <Divider style="height: 8px;" />

      <Flex v-if="hasCustomIntroduction" column expand :gap="0">
        <p class="user-preview-card__intro text-s">
          {{ introductionText }}
        </p>
      </Flex>
    </Flex>

    <Flex v-if="activity && props.showActivity && user" column gap="xxs" expand class="user-preview-card__activity">
      <ActivitySteam
        v-if="activity.steam_id"
        :profile-id="user.id"
        :steam-id="activity.steam_id"
        :is-own-profile="false"
      />

      <ActivityTeamspeak
        v-if="activity.teamspeak_identities && activity.teamspeak_identities.length > 0"
        :profile-id="user.id"
        :teamspeak-identities="activity.teamspeak_identities"
        :is-own-profile="false"
      />
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.user-preview-card {
  width: 320px;
  max-width: 100%;
  padding: var(--space-m);
  display: flex;
  flex-direction: column;

  &__activity {
    margin-top: var(--space-s);

    :deep(.activity-item) {
      width: 100%;
      border-radius: var(--border-radius-m);
      background-color: var(--color-bg-raised);
      box-shadow: var(--box-shadow);
    }
  }
}

.user-preview-card__header {
  margin-bottom: var(--space-m);
}

.user-preview-card__avatar-link {
  display: inline-flex;
}

.user-preview-card__identity {
  text-align: left;
}

.user-preview-card__name {
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  text-decoration: none;
}

.user-preview-card__name:hover {
  text-decoration: underline;
}

.user-preview-card__meta {
  margin: 0;
  color: var(--color-text-light);
}

.user-preview-card__intro {
  margin: 0;
  color: var(--color-text);
}

.user-preview-card__badges {
  padding-top: 12px;
}

.user-preview-card__cta {
  text-decoration: none;
}

.user-preview-card__state p {
  margin: 0;
}
</style>
