<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Flex, Input, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { stripHtmlTags, validateMarkdownNoHtml } from '@/lib/utils/sanitize'
import { deleteUserAvatar, getUserAvatarUrl, uploadUserAvatar } from '@/lib/utils/storage'

const props = defineProps<{
  profile: Tables<'profiles'> | null
  isOpen: boolean
  submissionError?: string | null
}>()

// Define emits
const emit = defineEmits(['save', 'close', 'update:isOpen', 'clearError'])

// Limits (matching database constraints)
const USERNAME_LIMIT = 32
const INTRODUCTION_LIMIT = 128
const MARKDOWN_LIMIT = 8128

// Form state
const profileForm = ref({
  username: '',
  introduction: '',
  markdown: '',
  website: '',
})

// Username validation rules based on database constraints
const usernameValidation = computed(() => {
  const username = profileForm.value.username.trim()

  if (!username) {
    return { valid: false, error: 'Username is required' }
  }

  if (username.length > USERNAME_LIMIT) {
    return { valid: false, error: `Username must be ${USERNAME_LIMIT} characters or less` }
  }

  if (!/^\w+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' }
  }

  if (/\s/.test(username)) {
    return { valid: false, error: 'Username cannot contain spaces' }
  }

  // Show submission error if it exists and is related to username
  if (props.submissionError && props.submissionError.toLowerCase().includes('username')) {
    return { valid: false, error: props.submissionError }
  }

  return { valid: true, error: null }
})

// Markdown validation
const markdownValidation = computed(() => {
  const markdown = profileForm.value.markdown.trim()

  if (markdown.length > MARKDOWN_LIMIT) {
    return { valid: false, error: `Content must be ${MARKDOWN_LIMIT} characters or less` }
  }

  return validateMarkdownNoHtml(markdown)
})

// Website validation
const websiteValidation = computed(() => {
  const website = profileForm.value.website.trim()

  if (!website) {
    return { valid: true, error: null }
  }

  // Auto-prepend https:// if no protocol is provided for validation
  let normalizedUrl = website
  if (!website.match(/^https?:\/\//)) {
    normalizedUrl = `https://${website}`
  }

  // Basic URL validation
  try {
    const url = new URL(normalizedUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Website must be a valid HTTP or HTTPS URL' }
    }
    return { valid: true, error: null }
  }
  catch {
    return { valid: false, error: 'Please enter a valid website URL' }
  }
})

// Function to normalize website URL
function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed)
    return trimmed

  if (!trimmed.match(/^https?:\/\//)) {
    return `https://${trimmed}`
  }

  return trimmed
}

// Form validation
const validation = computed(() => ({
  username: usernameValidation.value.valid,
  markdown: markdownValidation.value.valid,
  website: websiteValidation.value.valid,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Avatar upload state
const avatarUploading = ref(false)
const avatarError = ref<string | null>(null)
const avatarUrl = ref<string | null>(null)

// Avatar delete confirmation state
const showDeleteConfirm = ref(false)
const avatarDeleting = ref(false)

// Update form data when profile prop changes
watch(
  () => props.profile,
  async (newProfile) => {
    if (newProfile) {
      profileForm.value = {
        username: newProfile.username,
        introduction: newProfile.introduction || '',
        markdown: newProfile.markdown || '',
        website: (newProfile as Tables<'profiles'> & { website?: string }).website || '',
      }

      // Initialize avatar URL
      const supabase = useSupabaseClient()
      avatarUrl.value = await getUserAvatarUrl(supabase, newProfile.id)
    }
    else {
      // Reset form
      profileForm.value = {
        username: '',
        introduction: '',
        markdown: '',
        website: '',
      }

      avatarUrl.value = null
    }
  },
  { immediate: true },
)

// Clear submission error when username changes
watch(() => profileForm.value.username, () => {
  if (props.submissionError) {
    emit('clearError')
  }
})

// Handle closing the sheet
function handleClose() {
  emit('update:isOpen', false)
  emit('close')
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  // Prepare the data to save with HTML sanitization
  const profileData = {
    username: profileForm.value.username.trim(),
    introduction: profileForm.value.introduction.trim() || null,
    markdown: profileForm.value.markdown.trim() ? stripHtmlTags(profileForm.value.markdown.trim()) : null,
    website: profileForm.value.website.trim() ? normalizeWebsiteUrl(profileForm.value.website.trim()) : null,
  }

  emit('save', profileData)
}

// Handle avatar upload
async function handleAvatarUpload(file: File) {
  if (!props.profile)
    return

  try {
    avatarUploading.value = true
    avatarError.value = null

    const supabase = useSupabaseClient()
    const result = await uploadUserAvatar(supabase, props.profile.id, file)

    if (result.success && result.url) {
      avatarUrl.value = result.url
    }
    else {
      avatarError.value = result.error || 'Failed to upload avatar'
    }
  }
  catch (error) {
    console.error('Error uploading avatar:', error)
    avatarError.value = 'An unexpected error occurred'
  }
  finally {
    avatarUploading.value = false
  }
}

// Handle avatar removal
function handleAvatarRemove() {
  avatarUrl.value = null
  avatarError.value = null
}

// Handle avatar delete confirmation
function handleAvatarDeleteConfirm() {
  showDeleteConfirm.value = true
}

// Handle avatar deletion
async function handleAvatarDelete() {
  if (!props.profile)
    return

  try {
    avatarDeleting.value = true
    avatarError.value = null

    const supabase = useSupabaseClient()
    const result = await deleteUserAvatar(supabase, props.profile.id)

    if (result.success) {
      avatarUrl.value = null
    }
    else {
      avatarError.value = result.error || 'Failed to delete avatar'
    }
  }
  catch (error) {
    console.error('Error deleting avatar:', error)
    avatarError.value = 'An unexpected error occurred'
  }
  finally {
    avatarDeleting.value = false
  }
}

// Wrapper function for the confirm modal
async function confirmAvatarDelete() {
  await handleAvatarDelete()
}

// Character counts for text areas
const markdownCharCount = computed(() => profileForm.value.markdown.length)
const introductionCharCount = computed(() => profileForm.value.introduction.length)
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    separator
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Edit Profile</h4>
        <span v-if="props.profile" class="color-text-light text-xxs">
          {{ props.profile.username }}
        </span>
      </Flex>
    </template>

    <Flex column gap="l" class="profile-edit-form" expand>
      <!-- Avatar Section -->
      <Flex gap="m" expand>
        <!-- Basic Information -->
        <Flex column gap="m" expand>
          <h4>Basic Information</h4>

          <Flex expand class="profile-edit-form__username-container">
            <Input
              v-model="profileForm.username"
              expand
              name="username"
              label="Username"
              required
              :valid="usernameValidation.valid"
              :error="usernameValidation.error"
              placeholder="Enter your username"
              :maxlength="USERNAME_LIMIT"
            >
              <template #after>
                <Flex expand x-between>
                  <div v-if="!usernameValidation.valid && profileForm.username" class="help-text error">
                    <Icon name="ph:warning" />
                    {{ usernameValidation.error }}
                  </div>
                  <div v-else class="help-text">
                    <Icon name="ph:info" />
                    Username can only contain letters, numbers, and underscores. Usernames are case-insensitive.
                  </div>
                  <div class="character-count">
                    <span :class="{ 'over-limit': profileForm.username.length > USERNAME_LIMIT }">
                      {{ profileForm.username.length }}/{{ USERNAME_LIMIT }}
                    </span>
                  </div>
                </Flex>
              </template>
            </Input>
          </Flex>
          <Flex expand class="profile-edit-form__introduction-container">
            <Textarea
              v-model="profileForm.introduction"
              expand
              name="introduction"
              label="Introduction"
              placeholder="A brief introduction about yourself (optional)"
              :rows="3"
              :maxlength="INTRODUCTION_LIMIT"
            >
          <template #after>
            <div class="character-count">
              <span :class="{ 'over-limit': introductionCharCount > INTRODUCTION_LIMIT }">
                {{ introductionCharCount }}/{{ INTRODUCTION_LIMIT }}
              </span>
            </div>
          </template>
        </textarea>
          </Flex>

          <Flex expand class="profile-edit-form__website-container">
            <Input
              v-model="profileForm.website"
              expand
              name="website"
              label="Website"
              placeholder="https://yourwebsite.com"
              :valid="websiteValidation.valid"
              :error="websiteValidation.error"
            />
          </Flex>
        </Flex>
        <Flex column gap="m">
          <h4>Avatar</h4>
          <FileUpload
            variant="avatar"
            label="Upload Avatar"
            :preview-url="avatarUrl"
            :loading="avatarUploading"
            :deleting="avatarDeleting"
            :error="avatarError"
            :show-delete="!!avatarUrl"
            @upload="handleAvatarUpload"
            @remove="handleAvatarRemove"
            @delete="handleAvatarDeleteConfirm"
          />
        </Flex>
      </Flex>

      <!-- About Section -->
      <Flex column gap="m" expand>
        <h4>About</h4>

        <Flex class="profile-edit-form__markdown-container" expand>
          <Textarea
            v-model="profileForm.markdown"
            expand
            name="markdown"
            label="Profile Content (Markdown)"
            placeholder="Tell others about yourself!"
            :rows="8"
            :maxlength="MARKDOWN_LIMIT"
            :valid="markdownValidation.valid"
            :error="markdownValidation.error"
          >
          <template #after>
            <Flex expand x-between>
              <div class="help-text">
                <Icon name="ph:info" />
                You can use Markdown formatting (headings, lists, links, etc.). HTML tags are not allowed.
              </div>

              <div class="character-count">
                <span :class="{ 'over-limit': markdownCharCount > MARKDOWN_LIMIT }">
                  {{ markdownCharCount }}/{{ MARKDOWN_LIMIT }}
                </span>
              </div>
            </Flex>
          </template>
        </Textarea>
        </Flex>
      </Flex>

      <!-- Profile Tips -->
      <Flex column gap="s" class="profile-tips" expand>
        <h5>Profile Tips</h5>
        <ul class="tips-list">
          <li>
            <Icon name="ph:check-circle" />
            Use a clear, memorable username (letters, numbers, and underscores only)
          </li>
          <li>
            <Icon name="ph:check-circle" />
            Write a compelling introduction that summarizes who you are (128 characters max)
          </li>
          <li>
            <Icon name="ph:check-circle" />
            Add your website URL to showcase your work or portfolio
          </li>
          <li>
            <Icon name="ph:check-circle" />
            Use markdown in your content for rich formatting
          </li>
          <li>
            <Icon name="ph:warning-circle" />
            HTML tags are not allowed and will be removed for security
          </li>
          <li>
            <Icon name="ph:check-circle" />
            Connect your social accounts for better discoverability
          </li>
        </ul>
      </Flex>
    </Flex>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          variant="accent"
          :disabled="!isValid"
          @click="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          Save Changes
        </Button>

        <Button @click="handleClose">
          Cancel
        </Button>
      </Flex>
    </template>

    <!-- Delete Avatar Confirmation Modal -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      v-model:confirm="confirmAvatarDelete"
      title="Delete Avatar"
      description="Are you sure you want to delete your avatar? This action cannot be undone."
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.profile-edit-form {
  padding-bottom: var(--space-m);

  &__avatar-container {
    .avatar-preview {
      &__image {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--color-border);
      }

      &__placeholder {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px dashed var(--color-border);
        color: var(--color-text-light);
        font-size: var(--font-size-m);
      }
    }
  }

  &__introduction-container,
  &__markdown-container,
  &__username-container,
  &__website-container {
    position: relative;
  }

  h4 {
    margin: 0 0 var(--space-xs) 0;
    color: var(--color-text);
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-semibold);
  }

  h5 {
    margin: 0 0 var(--space-xs) 0;
    color: var(--color-text);
    font-size: var(--font-size-m);
    font-weight: var(--font-weight-semibold);
  }
}

.character-count {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-light);

  .over-limit {
    color: var(--color-text-red);
    font-weight: var(--font-weight-semibold);
  }
}

.help-text {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
  font-size: var(--font-size-s);
  color: var(--color-text-lightest);

  &.error {
    color: var(--color-text-red);

    .iconify {
      color: var(--color-text-red);
    }
  }
}

.profile-tips {
  background: var(--color-bg-subtle);
  padding: var(--space-m);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);

  .tips-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);

    li {
      display: flex;
      align-items: center;
      gap: var(--space-s);
      font-size: var(--font-size-s);
      color: var(--color-text-light);

      .iconify {
        color: var(--color-text-green);
        font-size: var(--font-size-m);
      }
    }
  }
}

.form-actions {
  .flex-1 {
    flex: 1;
  }
}
</style>
