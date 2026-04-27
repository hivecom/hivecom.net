<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Avatar, Button, Divider, Flex, Skeleton } from '@dolanske/vui'
import { computed, toRef } from 'vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
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
  showDescription?: boolean
  maxBadges?: number
  avatarSize?: 's' | 'm' | 'l' | number
}

const props = withDefaults(defineProps<Props>(), {
  showBadges: true,
  showActivity: true,
  showDescription: true,
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
// profiles to anon). Show a sign-in prompt instead of an error.
const isUnauthenticatedHidden = computed(() =>
  !currentUser.value && !loading.value && (!!error.value || !user.value) && !!props.userId,
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
  <div class="user-preview-card">
    <!-- Skeleton state -->
    <template v-if="loading">
      <Flex class="user-preview-card__header" expand x-between>
        <Skeleton :width="88" :height="88" :radius="44" />
        <Flex gap="xxs" class="user-preview-card__badges-skeleton">
          <Skeleton v-for="i in 3" :key="i" :width="28" :height="28" :radius="14" />
        </Flex>
      </Flex>

      <Flex column gap="xs" class="user-preview-card__identity">
        <Flex y-center gap="xs">
          <Skeleton :width="120" :height="22" :radius="4" />
          <Skeleton :width="48" :height="18" :radius="9" />
        </Flex>
        <Flex expand x-between>
          <Skeleton :width="140" :height="14" :radius="4" />
          <Skeleton :width="80" :height="14" :radius="4" />
        </Flex>
      </Flex>

      <Divider class="my-xs" />

      <Flex column gap="xs">
        <Skeleton :height="14" width="100%" :radius="4" />
        <Skeleton :height="14" width="85%" :radius="4" />
        <Skeleton :height="14" width="60%" :radius="4" />
      </Flex>
    </template>

    <!-- Empty / no userId -->
    <template v-else-if="!props.userId">
      <div class="user-preview-card__state text-center text-color-light">
        <p>Select a user to preview.</p>
      </div>
    </template>

    <!-- Unauthenticated and profile not visible - show sign-in prompt -->
    <template v-else-if="isUnauthenticatedHidden">
      <Flex column y-center x-center gap="s" class="user-preview-card__locked">
        <Flex column y-center x-center gap="xs">
          <Avatar :size="props.avatarSize" class="user-preview-card__locked-avatar" />
          <span class="user-preview-card__locked-name">Private User</span>
        </Flex>
        <Divider class="my-xs" />
        <Flex column y-center expand x-center gap="l" class="user-preview-card__locked-cta">
          <p class="user-preview-card__locked-text text-s">
            Sign in to see this user's profile.
          </p>
          <NuxtLink to="/auth/sign-in" class="user-preview-card__locked-link">
            <Button size="s" expand variant="accent">
              Sign in
            </Button>
          </NuxtLink>
        </Flex>
      </Flex>
    </template>

    <!-- Error state -->
    <template v-else-if="error || !user">
      <Flex column y-center gap="s" class="user-preview-card__state text-center text-color-light">
        <p>{{ error ?? 'We could not load this profile right now.' }}</p>
        <Button size="s" variant="gray" @click="handleRetry">
          Retry
        </Button>
      </Flex>
    </template>

    <!-- Loaded state -->
    <template v-else>
      <Flex column gap="xs">
        <Flex expand x-between class="user-preview-card__header">
          <Flex>
            <NuxtLink
              v-if="profileLink"
              :to="profileLink"
              class="user-preview-card__avatar-link"
              :aria-label="`View profile of ${user.username}`"
            >
              <AvatarMedia class="user-preview-card__avatar" :size="props.avatarSize" :url="user.avatarUrl || undefined" :alt="user.username">
                <template v-if="!user.avatarUrl" #default>
                  {{ userInitials }}
                </template>
              </AvatarMedia>
            </NuxtLink>
            <AvatarMedia
              v-else
              :size="props.avatarSize"
              :url="user.avatarUrl || undefined"
              :alt="user.username"
            >
              <template v-if="!user.avatarUrl" #default>
                {{ userInitials }}
              </template>
            </AvatarMedia>
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
              Joined {{ memberSince }}
            </p>
            <p v-if="countryInfo" class="user-preview-card__meta text-xs">
              {{ countryInfo.name }} {{ countryInfo.emoji }}
            </p>
          </Flex>
        </Flex>

        <Divider v-if="(props.showDescription && hasCustomIntroduction) || (activity && props.showActivity && (activity.steam_id || (activity.teamspeak_identities && activity.teamspeak_identities.length > 0)))" class="my-xs" />

        <template v-if="props.showDescription && hasCustomIntroduction">
          <Flex v-if="hasCustomIntroduction" column expand :gap="0">
            <p class="user-preview-card__intro text-s">
              {{ introductionText }}
            </p>
          </Flex>
        </template>
      </Flex>

      <Flex v-if="activity && props.showActivity && props.showDescription && user" column gap="xxs" expand class="user-preview-card__activity">
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
    </template>
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
      border: 1px solid var(--color-border);
    }

    :deep(.activity-item__label) {
      color: var(--color-text);

      .iconify {
        color: var(--color-text);
      }
    }
  }

  &__locked {
    text-align: center;
  }

  &__locked-avatar {
    opacity: 0.35;
    filter: grayscale(1);
  }

  &__locked-name {
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-lighter);
  }

  &__locked-cta {
    text-align: center;
  }

  &__locked-text {
    margin: 0;
    color: var(--color-text-light);
  }

  &__locked-link {
    width: 100%;
    text-decoration: none;
  }
}

.user-preview-card__header {
  margin-bottom: var(--space-m);
}

.user-preview-card__badges-skeleton {
  padding-top: 12px;
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
