<script setup lang="ts">
import { computed, toRef } from 'vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'
import { getAnonymousUsername } from '@/lib/anonymous-usernames'

const props = defineProps<{
  userId: string
}>()

const currentUser = useSupabaseUser()

const userIdRef = toRef(props, 'userId')

const { user, loading } = useCacheUserData(userIdRef)

const displayText = computed(() => {
  if (user.value?.username) {
    return `@${user.value.username}`
  }
  return `@${getAnonymousUsername(props.userId)}`
})

const profileLink = computed(() => {
  if (user.value?.username) {
    return `/profile/${user.value.username}`
  }
  return null
})
</script>

<template>
  <span v-if="loading && !user" class="user-mention-skeleton" />
  <UserPreviewHover v-else-if="currentUser" :user-id="props.userId">
    <NuxtLink
      v-if="profileLink"
      :to="profileLink"
      class="user-mention"
    >
      {{ displayText }}
    </NuxtLink>
    <span v-else class="user-mention user-mention--anonymous">
      {{ displayText }}
    </span>
  </UserPreviewHover>
  <template v-else>
    <NuxtLink
      v-if="profileLink"
      :to="profileLink"
      class="user-mention"
    >
      {{ displayText }}
    </NuxtLink>
    <span v-else class="user-mention user-mention--anonymous">
      {{ displayText }}
    </span>
  </template>
</template>

<style scoped lang="scss">
.user-mention {
  color: var(--color-accent);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  transition: opacity var(--transition-fast);
  cursor: pointer;

  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  &--anonymous {
    color: var(--color-text-light);
    cursor: default;

    &:hover {
      text-decoration: none;
      opacity: 1;
    }
  }
}

.user-mention-skeleton {
  display: inline-block;
  width: 8ch;
  height: 1em;
  background-color: var(--color-bg-raised);
  border-radius: var(--border-radius-xs);
  vertical-align: middle;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    opacity: 0.6;
  }
}
</style>
