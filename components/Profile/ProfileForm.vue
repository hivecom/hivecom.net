<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, Flex, Input, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { stripHtmlTags, validateMarkdownNoHtml } from '~/utils/sanitize'

const props = defineProps<{
  profile: Tables<'profiles'> | null
  isOpen: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'close', 'update:isOpen'])

// Limits (matching database constraints)
const USERNAME_LIMIT = 32
const INTRODUCTION_LIMIT = 128
const MARKDOWN_LIMIT = 8128

// Form state
const profileForm = ref({
  username: '',
  introduction: '',
  markdown: '',
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

// Form validation
const validation = computed(() => ({
  username: usernameValidation.value.valid,
  markdown: markdownValidation.value.valid,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Update form data when profile prop changes
watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      profileForm.value = {
        username: newProfile.username,
        introduction: newProfile.introduction || '',
        markdown: newProfile.markdown || '',
      }
    }
    else {
      // Reset form
      profileForm.value = {
        username: '',
        introduction: '',
        markdown: '',
      }
    }
  },
  { immediate: true },
)

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
  }

  emit('save', profileData)
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
                  Username can only contain letters, numbers, and underscores
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
  </Sheet>
</template>

<style scoped lang="scss">
.profile-edit-form {
  padding-bottom: var(--space-m);

  &__introduction-container,
  &__markdown-container,
  &__username-container {
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
