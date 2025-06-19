<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

const props = defineProps<{
  complaint: Tables<'complaints'>
}>()

const emit = defineEmits<{
  (e: 'select', complaint: Tables<'complaints'>): void
  (e: 'acknowledge', id: number): void
}>()

// Computed properties for status
const status = computed(() => {
  if (props.complaint.response) {
    return 'responded'
  }
  if (props.complaint.acknowledged) {
    return 'acknowledged'
  }
  return 'pending'
})

const statusConfig = computed(() => {
  switch (status.value) {
    case 'pending':
      return {
        label: 'Pending',
        variant: 'warning' as const,
        icon: 'ph:bell',
        color: 'var(--color-text-yellow)',
      }
    case 'acknowledged':
      return {
        label: 'Acknowledged',
        variant: 'info' as const,
        icon: 'ph:check-circle',
        color: 'var(--color-text-blue)',
      }
    case 'responded':
      return {
        label: 'Responded',
        variant: 'success' as const,
        icon: 'ph:chat-circle-dots',
        color: 'var(--color-text-green)',
      }
    default:
      return {
        label: 'Unknown',
        variant: 'neutral' as const,
        icon: 'ph:question',
        color: 'var(--color-text)',
      }
  }
})

// Truncate message for preview
const truncatedMessage = computed(() => {
  const maxLength = 150
  if (props.complaint.message.length <= maxLength) {
    return props.complaint.message
  }
  return `${props.complaint.message.substring(0, maxLength)}...`
})

// Handle card click
function handleCardClick() {
  emit('select', props.complaint)
}

// Handle acknowledge action
function handleAcknowledge(event: Event) {
  event.stopPropagation() // Prevent card selection
  emit('acknowledge', props.complaint.id)
}
</script>

<template>
  <Card
    class="complaint-card"
    :class="`complaint-card--${status}`"
    expand
    separators
    @click="handleCardClick"
  >
    <!-- Header with status and date -->
    <template #header>
      <Flex y-center :gap="0" class="complaint-card__header" expand>
        <Flex gap="xs" x-between y-center expand>
          <Flex gap="xs" column x-start y-center>
            <span class="complaint-card__id">Complaint #{{ complaint.id }}</span>
            <TimestampDate
              :date="complaint.created_at"
              relative
              size="xxs"
              class="color-text-light"
            />
          </Flex>
          <Badge :variant="statusConfig.variant" size="s">
            <Icon :name="statusConfig.icon" />
            {{ statusConfig.label }}
          </Badge>
        </Flex>
      </Flex>
    </template>

    <!-- User info -->
    <Flex class="complaint-card__user">
      <UserDisplay
        :user-id="complaint.created_by"
        size="s"
        show-role
      />
    </Flex>

    <!-- Message preview -->
    <div class="complaint-card__message">
      <p>{{ truncatedMessage }}</p>
    </div>

    <!-- Response indicator -->
    <template #footer>
      <!-- Actions -->
      <Flex gap="xs" x-end>
        <div v-if="complaint.response" class="complaint-card__response-indicator">
          <Flex gap="xs" y-center>
            <Icon name="ph:arrow-bend-down-left" class="color-text-light" />
            <span class="text-s color-text-light">Response provided</span>
            <TimestampDate
              v-if="complaint.responded_at"
              :date="complaint.responded_at"
              relative
              size="s"
            />
          </Flex>
        </div>
        <div v-else-if="complaint.acknowledged" class="complaint-card__response-indicator">
          <Flex gap="xs" y-center>
            <Icon name="ph:arrow-bend-up-right" class="color-text-light" />
            <span class="text-s color-text-light">No response yet</span>
          </Flex>
        </div>
        <Button
          v-if="status === 'pending'"
          size="s"
          variant="accent"
          @click="handleAcknowledge"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          Acknowledge
        </Button>
      </Flex>
    </template>
  </Card>
</template>

<style scoped lang="scss">
.complaint-card {
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  border-left: 4px solid var(--color-border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 280px;
}

/* Ensure the card content area grows to fill available space */
.complaint-card :deep(.vui-card-content) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Ensure footer stays at bottom */
.complaint-card :deep(.vui-card-footer) {
  margin-top: auto;
  justify-content: flex-end;
}

.complaint-card:hover {
  background-color: var(--color-bg-raised);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.complaint-card:hover .complaint-card__click-indicator {
  color: var(--color-accent);
}

.complaint-card--pending {
  border-left-color: var(--color-text-yellow);
}

.complaint-card--acknowledged {
  border-left-color: var(--color-text-blue);
}

.complaint-card--responded {
  border-left-color: var(--color-text-green);
}

.complaint-card__header {
  margin-bottom: var(--space-s);
}

.complaint-card__id {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  font-size: var(--font-size-s);
}

.complaint-card__user {
  margin-bottom: var(--space-m);
}

.complaint-card__message {
  margin-bottom: var(--space-m);
  flex: 1;
  display: flex;
  align-items: flex-start;
  min-height: 80px; /* Ensure minimum space for message content */
}

.complaint-card__message p {
  margin: 0;
  line-height: 1.5;
  color: var(--color-text);
}

.complaint-card__response-indicator {
  padding: var(--space-xs) var(--space-s);
  background-color: var(--color-bg-subtle);
  border-radius: var(--border-radius-s);
}

.complaint-card__click-indicator {
  position: absolute;
  top: 50%;
  right: var(--space-m);
  transform: translateY(-50%);
  color: var(--color-text-light);
  transition: color 0.2s ease;
}

/* New complaint pulse animation */
.complaint-card--pending .complaint-card__header::before {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  background: linear-gradient(45deg, transparent, var(--color-text-yellow), transparent);
  opacity: 0.1;
  border-radius: var(--border-radius-m);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.1;
  }
  50% {
    opacity: 0.2;
  }
}

.vui-card .vui-card-footer {
  background: none !important; /* Remove default footer background */
}
</style>
