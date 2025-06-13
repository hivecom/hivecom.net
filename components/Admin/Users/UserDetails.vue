<script setup lang="ts">
import { Card, CopyClipboard, Flex, Grid, Sheet } from '@dolanske/vui'
import { computed, watch } from 'vue'

import MDRenderer from '~/components/Shared/MDRenderer.vue'
import Metadata from '~/components/Shared/Metadata.vue'
import RoleIndicator from '~/components/Shared/RoleIndicator.vue'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import UserLink from '~/components/Shared/UserLink.vue'
import UserActions from './UserActions.vue'
import UserStatusIndicator from './UserStatusIndicator.vue'

const props = defineProps<{
  user: {
    id: string
    username: string
    created_at: string
    modified_at: string | null
    modified_by: string | null
    supporter_patreon: boolean
    supporter_lifetime: boolean
    patreon_id: string | null
    discord_id: string | null
    steam_id: string | null
    introduction: string | null
    markdown: string | null
    banned: boolean
    ban_reason: string | null
    ban_start: string | null
    ban_end: string | null
    ban_duration?: string
    role?: string | null
  } | null
}>()

// Define emits
const emit = defineEmits(['edit'])

// Get current user
const currentUser = useSupabaseUser()

// Define models for two-way binding with proper type definitions
const isOpen = defineModel<boolean>('isOpen', { default: false })

// Type that specifically allows null
type UserAction = {
  user: any
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
  banReason?: string
} | null
const userAction = defineModel<UserAction>('userAction', { default: null })

// Add a refreshTrigger model to request a refresh from parent
const refreshUser = defineModel<boolean>('refreshUser', { default: false })

// Watch for userAction changes to trigger data refresh after actions are performed
watch(() => userAction.value, (action) => {
  if (action) {
    // If it's an edit action, emit edit event - let parent handle closing
    if (action.type === 'edit') {
      emit('edit', props.user)
      // Remove: isOpen.value = false - let parent handle this
      return
    }

    // After a longer delay to ensure the action completes and data is updated on the server
    setTimeout(() => {
      // Set refresh flag to true to trigger refresh in parent
      refreshUser.value = true
    }, 1500) // Increased from 500ms to 1500ms for more reliable updates
  }
})

// Computed property for user status
const userStatus = computed(() => {
  if (!props.user) {
    return 'active'
  }

  if (props.user.banned) {
    return 'banned'
  }

  return 'active'
})

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!user && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>User Details</h4>
          <span v-if="user" class="color-text-light text-xxs">
            <UserLink :user-id="user.id" />
          </span>
        </Flex>
        <UserActions
          v-if="user"
          v-model="userAction"
          :user="user"
          :status="userStatus"
          :show-labels="true"
          :current-user-id="currentUser?.id"
        />
      </Flex>
    </template>

    <Flex v-if="user" column gap="m" class="user-detail">
      <Flex column gap="m" expand>
        <!-- Basic Info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">UUID:</span>
              <CopyClipboard :text="user.id" variant="outline" size="xs">
                <span class="user-id">{{ user.id }}</span>
              </CopyClipboard>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Username:</span>
              <UserLink :user-id="user.id" />
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Status:</span>
              <UserStatusIndicator :status="userStatus" :show-label="true" />
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Role:</span>
              <RoleIndicator :role="user.role" />
            </Grid>

            <Grid v-if="user.banned && user.ban_duration" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Ban Duration:</span>
              <span class="ban-duration">{{ user.ban_duration }}</span>
            </Grid>
          </Flex>
        </Card>

        <!-- Ban Information -->
        <Card v-if="user.banned" separators class="ban-info-card">
          <template #header>
            <h6 class="ban-header">
              Ban Information
            </h6>
          </template>

          <Flex column gap="l" expand>
            <Grid v-if="user.ban_reason" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Reason:</span>
              <span class="ban-reason-text">{{ user.ban_reason }}</span>
            </Grid>

            <Grid v-if="user.ban_start" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Ban Start:</span>
              <TimestampDate :date="user.ban_start" />
            </Grid>

            <Grid v-if="user.ban_end" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Ban End:</span>
              <TimestampDate :date="user.ban_end" />
            </Grid>

            <Grid v-else-if="user.banned" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Ban Type:</span>
              <span class="ban-permanent">Permanent</span>
            </Grid>

            <Grid v-if="user.ban_duration" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Duration:</span>
              <span class="ban-duration">{{ user.ban_duration }}</span>
            </Grid>
          </Flex>
        </Card>

        <!-- Platform Connections -->
        <Card
          v-if="user.patreon_id || user.discord_id || user.steam_id"
          separators
        >
          <template #header>
            <h6>Platform Connections</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid v-if="user.patreon_id" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Patreon ID:</span>
              <CopyClipboard :text="user.patreon_id" variant="outline" size="xs">
                <span class="platform-id">{{ user.patreon_id }}</span>
              </CopyClipboard>
            </Grid>

            <Grid v-if="user.discord_id" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Discord ID:</span>
              <CopyClipboard :text="user.discord_id" variant="outline" size="xs">
                <span class="platform-id">{{ user.discord_id }}</span>
              </CopyClipboard>
            </Grid>

            <Grid v-if="user.steam_id" class="detail-item" :columns="2" expand>
              <span class="color-text-light text-bold">Steam ID:</span>
              <CopyClipboard :text="user.steam_id" variant="outline" size="xs">
                <span class="platform-id">{{ user.steam_id }}</span>
              </CopyClipboard>
            </Grid>
          </Flex>
        </Card>

        <!-- User Introduction -->
        <Card v-if="user.introduction" separators>
          <template #header>
            <h6>Introduction</h6>
          </template>
          <div class="introduction-text">
            {{ user.introduction }}
          </div>
        </Card>

        <!-- User Profile Markdown -->
        <Card v-if="user.markdown" separators>
          <template #header>
            <h6>Profile Content</h6>
          </template>
          <div class="profile-markdown">
            <MDRenderer :md="user.markdown" />
          </div>
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="user.created_at"
          :modified-at="user.modified_at"
          :modified-by="user.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.user-detail {
  padding-bottom: var(--space);
}

.user-id,
.platform-id {
  font-family: monospace;
  font-size: var(--font-size-s);
  background-color: var(--color-bg-light);
  padding: 2px 6px;
  border-radius: var(--border-radius-xs);
}

.ban-duration {
  color: var(--color-danger);
  font-weight: var(--font-weight-medium);
}

.ban-info-card {
  border-left: 4px solid var(--color-danger);
}

.ban-header {
  color: var(--color-danger);
  margin: 0;
}

.ban-reason-text {
  color: var(--color-text);
  line-height: 1.4;
}

.ban-permanent {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold);
}

.introduction-text {
  line-height: 1.6;
  color: var(--color-text);
}

.profile-markdown {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  padding: var(--space-m);
  background-color: var(--color-bg-lowered);
}
</style>
