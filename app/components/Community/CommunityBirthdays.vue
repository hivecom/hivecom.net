<script setup lang="ts">
import { Avatar, Flex } from '@dolanske/vui'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useBulkDataUser } from '@/composables/useDataUser'

const props = defineProps<{
  userIds: string[]
  showDivider?: boolean
}>()

const userIdsRef = computed(() => props.userIds)

const { users } = useBulkDataUser(userIdsRef, {
  includeRole: false,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

const usersList = computed(() => {
  const entries: Array<{ id: string, username: string, avatarUrl: string | null }> = []

  for (const id of props.userIds) {
    const profile = users.value.get(id)
    if (!profile || !profile.username)
      continue

    entries.push({
      id,
      username: profile.username,
      avatarUrl: profile.avatarUrl ?? null,
    })
  }

  return entries
})

function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}
</script>

<template>
  <template v-if="usersList.length > 0">
    <div v-if="showDivider" class="birthday-divider" />

    <Flex column gap="m" x-center y-center>
      <Flex y-center gap="s" x-center>
        <h3 class="shiny-text text-l">
          Happy Birthday!
        </h3>
      </Flex>

      <Flex wrap x-center y-center gap="m">
        <NuxtLink
          v-for="entry in usersList"
          :key="entry.id"
          :to="`/profile/${entry.username}`"
          class="birthday-user"
        >
          <UserPreviewHover :user-id="entry.id">
            <div class="birthday-avatar-ring">
              <Avatar
                :size="56"
                :url="entry.avatarUrl || undefined"
              >
                <template v-if="!entry.avatarUrl" #default>
                  {{ getUserInitials(entry.username) }}
                </template>
              </Avatar>
            </div>
          </UserPreviewHover>
        </NuxtLink>
      </Flex>
    </Flex>
  </template>
</template>

<style lang="scss" scoped>
.birthday-divider {
  width: 100%;
  border-top: 1px solid var(--color-border);
}

.birthday-user {
  text-decoration: none;
  color: var(--color-text);
  transition: transform var(--transition);

  &:hover {
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
    border-radius: var(--border-radius-s);
  }
}

.birthday-avatar-ring {
  border-radius: 50%;
  padding: 2px;
  background: var(--shiny-gradient);
  background-size: 200% 200%;
  animation: shinyHueRotate 8s linear infinite;
  display: inline-flex;
}
</style>
