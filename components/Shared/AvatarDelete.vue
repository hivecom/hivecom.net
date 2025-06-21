<script setup lang="ts">
import { Avatar } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from './ConfirmModal.vue'

interface Props {
  userId: string
  username: string
  avatarUrl?: string | null
  loading?: boolean
  disabled?: boolean
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  loading: false,
  disabled: false,
})

const emit = defineEmits<{
  delete: []
}>()

// State
const showDeleteConfirm = ref(false)
const imageExists = ref(true)
const isHovered = ref(false)

// Computed properties
const hasAvatar = computed(() => !!props.avatarUrl && imageExists.value)
const showOverlay = computed(() => hasAvatar.value && (isHovered.value || props.loading) && !props.disabled)

// Watch for avatar URL changes to check if image exists
watch(() => props.avatarUrl, (newUrl) => {
  if (newUrl) {
    // Create a new image to test if the URL is valid
    const img = new Image()
    img.onload = () => {
      imageExists.value = true
    }
    img.onerror = () => {
      imageExists.value = false
    }
    img.src = newUrl
  }
  else {
    imageExists.value = false
  }
}, { immediate: true })

// Get user initials for avatar fallback
function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

// Handle delete confirmation
function handleDeleteConfirm() {
  emit('delete')
  showDeleteConfirm.value = false
}

// Open delete confirmation modal
function openDeleteConfirm() {
  if (!props.disabled && !props.loading && hasAvatar.value) {
    showDeleteConfirm.value = true
  }
}

// Handle mouse events
function handleMouseEnter() {
  if (hasAvatar.value && !props.disabled) {
    isHovered.value = true
  }
}

function handleMouseLeave() {
  isHovered.value = false
}
</script>

<template>
  <div
    class="avatar-delete-container"
    :class="{
      'has-avatar': hasAvatar,
      'is-disabled': disabled,
      'is-loading': loading,
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @click="openDeleteConfirm"
  >
    <!-- Avatar -->
    <Avatar :size="size" :url="avatarUrl || undefined">
      <template v-if="!hasAvatar" #default>
        {{ getUserInitials(username) }}
      </template>
    </Avatar>

    <!-- Hover Overlay -->
    <div v-if="showOverlay" class="delete-overlay">
      <div class="overlay-content">
        <Icon
          v-if="loading"
          name="ph:spinner"
          spin
          class="overlay-icon loading"
        />
        <Icon
          v-else
          name="ph:trash"
          class="overlay-icon delete"
        />
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteConfirm"
    v-model:confirm="handleDeleteConfirm"
    title="Delete User Avatar"
    :description="`Are you sure you want to delete ${username}'s avatar? This action cannot be undone.`"
    confirm-text="Delete Avatar"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped lang="scss">
.avatar-delete-container {
  position: relative;
  display: inline-block;
  cursor: default;

  &.has-avatar:not(.is-disabled) {
    cursor: pointer;
  }

  &.is-disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.delete-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  backdrop-filter: blur(2px);
}

.overlay-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.overlay-icon {
  font-size: calc(var(--font-size-xl) + 4px);
  color: white;

  &.delete {
    transition: transform 0.2s ease;

    .avatar-delete-container:hover & {
      transform: scale(1.1);
    }
  }

  &.loading {
    font-size: var(--font-size-xl);
  }
}

/* Hover effects */
.avatar-delete-container.has-avatar:not(.is-disabled):hover {
  .delete-overlay {
    background: rgba(220, 38, 38, 0.8);
  }
}
</style>
