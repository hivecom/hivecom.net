<script setup lang="ts">
import { Badge, Button, Flex, Modal, Tab, Tabs } from '@dolanske/vui'
import { computed, ref } from 'vue'
import BulkUserDisplay from '@/components/Shared/BulkUserDisplay.vue'

interface Props {
  friends: string[]
  sentRequests: string[]
  pendingRequests: string[]
  userName: string
  open: boolean
  showAllTabs: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

// Modal state
const isOpen = defineModel<boolean>('open', { default: false })

// Tab state
const activeTab = ref<'friends' | 'sent' | 'pending'>('friends')

// Computed counts for each tab
const friendsCount = computed(() => props.friends.length)
const sentCount = computed(() => props.sentRequests.length)
const pendingCount = computed(() => props.pendingRequests.length)

// Computed data for current tab (only show friends for other users)
const currentTabData = computed(() => {
  if (!props.showAllTabs) {
    return props.friends
  }

  switch (activeTab.value) {
    case 'friends':
      return props.friends
    case 'sent':
      return props.sentRequests
    case 'pending':
      return props.pendingRequests
    default:
      return []
  }
})

function handleClose() {
  isOpen.value = false
  emit('close')
}
</script>

<template>
  <Modal :open="isOpen" centered @close="handleClose">
    <template #header>
      <Flex x-between y-center expand>
        <h3>{{ userName }}'s Friends</h3>
        <Badge variant="neutral">
          {{ friendsCount }} {{ friendsCount === 1 ? 'friend' : 'friends' }}
        </Badge>
      </Flex>
    </template>

    <div class="friends-modal-content">
      <!-- Tabs (only show for own profile) -->
      <Tabs v-if="showAllTabs" v-model="activeTab" class="friends-modal__tabs" expand variant="filled">
        <Tab value="friends">
          <Flex y-center gap="xs">
            <Icon name="ph:users" />
            Friends
            <Badge v-if="friendsCount > 0" variant="success" size="s">
              {{ friendsCount }}
            </Badge>
          </Flex>
        </Tab>
        <Tab value="sent">
          <Flex y-center gap="xs">
            <Icon name="ph:paper-plane-tilt" />
            Sent
            <Badge v-if="sentCount > 0" variant="info" size="s">
              {{ sentCount }}
            </Badge>
          </Flex>
        </Tab>
        <Tab value="pending">
          <Flex y-center gap="xs">
            <Icon name="ph:bell" />
            Pending
            <Badge v-if="pendingCount > 0" variant="warning" size="s">
              {{ pendingCount }}
            </Badge>
          </Flex>
        </Tab>
      </Tabs>

      <!-- Tab Content -->
      <div class="friends-modal__tab-content">
        <!-- Empty State -->
        <div v-if="currentTabData.length === 0" class="friends-modal__tab-empty">
          <Flex column y-center x-center gap="s">
            <Icon
              :name="!showAllTabs || activeTab === 'friends' ? 'ph:users' : activeTab === 'sent' ? 'ph:paper-plane-tilt' : 'ph:bell'"
              size="32"
              class="color-text-light"
            />
            <p class="color-text-light text-center">
              <template v-if="!showAllTabs || activeTab === 'friends'">
                No friends yet.
              </template>
              <template v-else-if="activeTab === 'sent'">
                No friend requests sent.
              </template>
              <template v-else>
                No pending friend requests.
              </template>
            </p>
          </Flex>
        </div>

        <!-- User List -->
        <BulkUserDisplay
          v-else
          :user-ids="currentTabData"
          :columns="2"
          gap="s"
          :expand="true"
          user-size="s"
          item-class="friends-modal__user-item"
        />
      </div>
    </div>

    <template #footer>
      <Flex gap="xs" x-end>
        <Button variant="gray" @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.friends-modal-content {
  min-height: 300px;
  max-height: 500px;
}

.friends-modal__tabs {
  margin-bottom: var(--space-m);

  &:not(:last-child) {
    margin-bottom: var(--space-m);
  }
}

.friends-modal__tab-content {
  min-height: 200px;
}

.friends-modal__tab-empty {
  padding: var(--space-xl);
  text-align: center;

  p {
    margin: 0;
    font-size: var(--font-size-s);
  }
}

.friends-modal__user-item {
  padding: var(--space-s);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--color-bg-raised);
  }
}
</style>
