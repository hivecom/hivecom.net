<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, Badge, Button, Flex, Modal, Skeleton, Tab, Tabs } from '@dolanske/vui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BulkUserDisplay from '~/components/Shared/BulkUserDisplay.vue'

interface Props {
  event: Tables<'events'>
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

// Modal state
const isOpen = defineModel<boolean>('open', { default: false })

// Tab state
const activeTab = ref<'yes' | 'tentative' | 'no'>('yes')

// Data state
const supabase = useSupabaseClient()
const loading = ref(true)
const error = ref('')

// RSVP data by status
const rsvpData = ref<{
  yes: string[]
  tentative: string[]
  no: string[]
}>({
  yes: [],
  tentative: [],
  no: [],
})

// Computed counts for each tab
const yesCount = computed(() => rsvpData.value.yes.length)
const tentativeCount = computed(() => rsvpData.value.tentative.length)
const noCount = computed(() => rsvpData.value.no.length)
const totalCount = computed(() => yesCount.value + tentativeCount.value + noCount.value)

// Computed data for current tab - returns array of user IDs
const currentTabData = computed(() => {
  return rsvpData.value[activeTab.value] || []
})

// Fetch RSVP data
async function fetchRSVPs() {
  if (!props.event?.id)
    return

  loading.value = true
  error.value = ''

  try {
    const { data, error: fetchError } = await supabase
      .from('events_rsvps')
      .select('user_id, rsvp')
      .eq('event_id', props.event.id)
      .order('created_at', { ascending: true })

    if (fetchError) {
      throw fetchError
    }

    // Group RSVPs by status - store just user IDs
    const groupedData: {
      yes: string[]
      tentative: string[]
      no: string[]
    } = {
      yes: [],
      tentative: [],
      no: [],
    }

    if (data) {
      data.forEach((rsvp) => {
        if (rsvp.rsvp && groupedData[rsvp.rsvp as keyof typeof groupedData]) {
          groupedData[rsvp.rsvp as keyof typeof groupedData].push(rsvp.user_id)
        }
      })
    }

    rsvpData.value = groupedData
  }
  catch (err) {
    console.error('Error fetching RSVPs:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load RSVPs'
  }
  finally {
    loading.value = false
  }
}

// Watch for modal opening
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    fetchRSVPs()
    // Set default tab to the one with the most responses, or 'yes' if tied
    if (yesCount.value >= tentativeCount.value && yesCount.value >= noCount.value) {
      activeTab.value = 'yes'
    }
    else if (tentativeCount.value >= noCount.value) {
      activeTab.value = 'tentative'
    }
    else if (noCount.value > 0) {
      activeTab.value = 'no'
    }
    else {
      activeTab.value = 'yes'
    }
  }
}, { immediate: true })

// Listen for RSVP updates to refresh data
function handleRsvpUpdate(event: Event) {
  const customEvent = event as CustomEvent
  if (customEvent.detail?.eventId === props.event.id) {
    fetchRSVPs()
  }
}

onMounted(() => {
  window.addEventListener('rsvp-updated', handleRsvpUpdate)
})

onUnmounted(() => {
  window.removeEventListener('rsvp-updated', handleRsvpUpdate)
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
        <h3>Event RSVPs</h3>
        <Badge v-if="!loading && totalCount > 0" variant="neutral">
          {{ totalCount }} {{ totalCount === 1 ? 'response' : 'responses' }}
        </Badge>
      </Flex>
    </template>

    <div class="rsvp-modal-content">
      <!-- Loading State -->
      <div v-if="loading" class="rsvp-modal__loading">
        <Flex column gap="m">
          <Skeleton height="2rem" width="100%" />
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="1rem" width="90%" />
        </Flex>
      </div>

      <!-- Error State -->
      <Alert v-else-if="error" variant="danger">
        {{ error }}
      </Alert>

      <!-- Content -->
      <div v-else>
        <!-- No RSVPs State -->
        <div v-if="totalCount === 0" class="rsvp-modal__empty">
          <Flex column y-center x-center gap="m">
            <Icon name="ph:users-three" size="48" class="rsvp-modal__empty-icon" />
            <h4>No RSVPs yet</h4>
            <p class="color-text-light text-center">
              Be the first to RSVP to this event!
            </p>
          </Flex>
        </div>

        <!-- Tabs and Content -->
        <div v-else>
          <!-- Tabs -->
          <Tabs v-model="activeTab" class="rsvp-modal__tabs" expand variant="filled">
            <Tab value="yes">
              <Flex y-center gap="xs">
                <Icon name="ph:check-circle" />
                Going
                <Badge v-if="yesCount > 0" variant="success" size="s">
                  {{ yesCount }}
                </Badge>
              </Flex>
            </Tab>
            <Tab value="tentative">
              <Flex y-center gap="xs">
                <Icon name="ph:question" />
                Maybe
                <Badge v-if="tentativeCount > 0" variant="warning" size="s">
                  {{ tentativeCount }}
                </Badge>
              </Flex>
            </Tab>
            <Tab value="no">
              <Flex y-center gap="xs">
                <Icon name="ph:x-circle" />
                Not Going
                <Badge v-if="noCount > 0" variant="neutral" size="s">
                  {{ noCount }}
                </Badge>
              </Flex>
            </Tab>
          </Tabs>

          <!-- Tab Content -->
          <div class="rsvp-modal__tab-content">
            <!-- No users in this category -->
            <div v-if="currentTabData.length === 0" class="rsvp-modal__tab-empty">
              <Flex column y-center x-center gap="s">
                <Icon
                  :name="activeTab === 'yes' ? 'ph:check-circle' : activeTab === 'tentative' ? 'ph:question' : 'ph:x-circle'"
                  size="32"
                  class="color-text-light"
                />
                <p class="color-text-light text-center">
                  No one has RSVP'd
                  {{ activeTab === 'yes' ? 'as going' : activeTab === 'tentative' ? 'as maybe' : 'as not going' }}
                  yet.
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
              item-class="rsvp-modal__user-item"
            />
          </div>
        </div>
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
.rsvp-modal-content {
  min-height: 300px;
  max-height: 500px;
}

.rsvp-modal__loading {
  padding: var(--space-l);
}

.rsvp-modal__empty {
  padding: var(--space-xl);
  text-align: center;

  &-icon {
    color: var(--color-text-light);
  }

  h4 {
    margin: 0;
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: var(--font-size-s);
  }
}

.rsvp-modal__tabs {
  margin-bottom: var(--space-m);
}

.rsvp-modal__tab-content {
  min-height: 200px;
}

.rsvp-modal__tab-empty {
  padding: var(--space-xl);
  text-align: center;

  p {
    margin: 0;
    font-size: var(--font-size-s);
  }
}

.rsvp-modal__user-item {
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
