<script setup lang="ts">
import { Avatar, Button, Card, Divider, Flex, Spinner } from '@dolanske/vui'
import { computed, toRef } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import UserPreviewCardBadges from '@/components/Shared/UserPreviewCardBadges.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'
import { getCountryInfo } from '@/lib/utils/country'

interface Props {
  userId: string | null | undefined
  showBadges?: boolean
  maxBadges?: number
}

const props = withDefaults(defineProps<Props>(), {
  showBadges: true,
  maxBadges: 4,
})

const userIdRef = toRef(props, 'userId')

const {
  user,
  loading,
  error,
  userInitials,
  refetch,
} = useCacheUserData(userIdRef, {
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
</script>

<template>
  <Card v-if="!loading" class="user-preview-card">
    <div v-if="!props.userId" class="user-preview-card__state user-preview-card__state--empty">
      <p>Select a user to preview.</p>
    </div>

    <div v-else-if="error || !user" class="user-preview-card__state user-preview-card__state--error">
      <p>{{ error ?? 'We could not load this profile right now.' }}</p>
      <Button size="s" variant="gray" @click="handleRetry">
        Retry
      </Button>
    </div>

    <div v-else class="user-preview-card__content">
      <Flex expand x-between class="user-preview-card__header">
        <Flex>
          <NuxtLink
            v-if="profileLink"
            :to="profileLink"
            class="user-preview-card__avatar-link"
            :aria-label="`View profile of ${user.username}`"
          >
            <Avatar class="user-preview-card__avatar" size="l" :url="user.avatarUrl || undefined">
              <template v-if="!user.avatarUrl" #default>
                {{ userInitials }}
              </template>
            </Avatar>
          </NuxtLink>
          <Avatar
            v-else
            size="l"
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

      <div class="user-preview-card__identity">
        <div class="user-preview-card__name-row">
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
        </div>

        <Flex expand x-between>
          <p v-if="memberSince" class="user-preview-card__meta text-xs">
            Member since {{ memberSince }}
          </p>
          <p v-if="countryInfo" class="user-preview-card__meta text-xs">
            {{ countryInfo.name }} {{ countryInfo.emoji }}
          </p>
        </Flex>
      </div>

      <div v-if="hasCustomIntroduction">
        <Divider />

        <p
          class="user-preview-card__intro text-s"
        >
          {{ introductionText }}
        </p>
      </div>
    </div>
  </Card>
</template>

<style scoped lang="scss">
.user-preview-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  width: 320px;
  max-width: 100%;
}

.user-preview-card__avatar {
  min-width: 64px;
  min-height: 64px;
}

.user-preview-card__content {
  display: flex;
  flex-direction: column;
}

.user-preview-card__state {
  text-align: center;
  color: var(--color-text-light);
}

.user-preview-card__state--error {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  align-items: center;
}

.user-preview-card__header {
  margin-bottom: var(--space-m);
}

.user-preview-card__avatar-link {
  display: inline-flex;
}

.user-preview-card__identity {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  text-align: left;
}

.user-preview-card__name-row {
  display: inline-flex;
  gap: var(--space-xs);
  align-items: center;
  flex-wrap: wrap;
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

.user-preview-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
  align-items: center;
}

.user-preview-card__cta {
  text-decoration: none;
}

.user-preview-card__state--empty p {
  margin: 0;
}
</style>
