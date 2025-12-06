<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Calendar, Flex, Input, Select, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { deleteUserAvatar, getUserAvatarUrl, uploadUserAvatar } from '@/lib/storage'
import { COUNTRY_SELECT_OPTIONS } from '@/lib/utils/country'
import { replaceMarkdownH1, stripHtmlTags, validateMarkdownNoHtml } from '@/lib/utils/sanitize'

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
const BIRTHDAY_MIN_VALUE = '1900-01-01' as const

// Form state
const profileForm = ref({
  username: '',
  introduction: '',
  markdown: '',
  website: '',
  country: '',
  birthday: '',
})

type CountrySelectOption = (typeof COUNTRY_SELECT_OPTIONS)[number]

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

// Country validation (optional)
const countryValidation = computed(() => {
  const country = profileForm.value.country.trim()

  if (!country)
    return { valid: true, error: null }

  const match = COUNTRY_SELECT_OPTIONS.some(option => option.value === country.toUpperCase())

  if (!match)
    return { valid: false, error: 'Please select a valid country' }

  return { valid: true, error: null }
})

const birthdayValidation = computed(() => {
  const birthday = profileForm.value.birthday.trim()

  if (!birthday)
    return { valid: true, error: null }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return { valid: false, error: 'Please enter a valid date (YYYY-MM-DD)' }
  }

  const parsed = new Date(birthday)
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, error: 'Please enter a valid date' }
  }

  const today = new Date()
  if (parsed > today) {
    return { valid: false, error: 'Birthday cannot be in the future' }
  }

  if (birthday < BIRTHDAY_MIN_VALUE) {
    return { valid: false, error: `Birthday cannot be before ${BIRTHDAY_MIN_VALUE}` }
  }

  return { valid: true, error: null }
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
  country: countryValidation.value.valid,
  birthday: birthdayValidation.value.valid,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Avatar upload state
const avatarUploading = ref(false)
const avatarError = ref<string | null>(null)
const avatarUrl = ref<string | null>(null)

// Avatar delete confirmation state
const showDeleteConfirm = ref(false)
const avatarDeleting = ref(false)

const countrySelectModel = computed<CountrySelectOption[] | undefined>({
  get() {
    if (!profileForm.value.country)
      return undefined

    const match = COUNTRY_SELECT_OPTIONS.find(option => option.value === profileForm.value.country)
    return match ? [match] : undefined
  },
  set(value) {
    const selection = value?.[0]
    profileForm.value.country = selection?.value ?? ''
  },
})

function parseDateOnly(value: string): Date | null {
  if (!value)
    return null

  const parts = value.split('-')
  if (parts.length !== 3)
    return null

  const [yearStr, monthStr, dayStr] = parts
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if ([year, month, day].some(num => Number.isNaN(num)))
    return null

  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const birthdayDateModel = computed<Date | null>({
  get() {
    return parseDateOnly(profileForm.value.birthday)
  },
  set(value) {
    profileForm.value.birthday = value ? formatDateOnly(value) : ''
  },
})

const birthdayButtonLabel = computed(() => {
  if (!birthdayDateModel.value)
    return 'Choose birthday (optional)'

  return birthdayDateModel.value.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
})

const hasBirthday = computed(() => !!profileForm.value.birthday)

function clearBirthday() {
  profileForm.value.birthday = ''
}

// Update form data when profile prop changes
watch(
  () => props.profile,
  async (newProfile) => {
    if (newProfile) {
      const normalizedCountry = newProfile.country?.toUpperCase() ?? ''
      const hasValidCountry = COUNTRY_SELECT_OPTIONS.some(option => option.value === normalizedCountry)

      profileForm.value = {
        username: newProfile.username,
        introduction: newProfile.introduction || '',
        markdown: newProfile.markdown || '',
        website: (newProfile as Tables<'profiles'> & { website?: string }).website || '',
        country: hasValidCountry ? normalizedCountry : '',
        birthday: newProfile.birthday || '',
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
        country: '',
        birthday: '',
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

  // Pre-process markdown
  // Prepare the data to save with HTML sanitization
  const profileData = {
    username: profileForm.value.username.trim(),
    introduction: profileForm.value.introduction.trim() || null,
    markdown: profileForm.value.markdown.trim()
      ? replaceMarkdownH1(stripHtmlTags(profileForm.value.markdown.trim()))
      : null,
    website: profileForm.value.website.trim() ? normalizeWebsiteUrl(profileForm.value.website.trim()) : null,
    country: profileForm.value.country.trim() ? profileForm.value.country.trim().toUpperCase() : null,
    birthday: profileForm.value.birthday.trim() ? profileForm.value.birthday.trim() : null,
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
        <span v-if="props.profile" class="text-color-light text-xxs">
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
          <Flex column gap="xs" expand class="profile-edit-form__birthday-container">
            <label class="text-s text-color-lighter">Birthday</label>
            <Flex expand gap="xs" y-center>
              <Calendar
                v-model="birthdayDateModel"
                expand
                format="yyyy-MM-dd"
                :class="{ invalid: !birthdayValidation.valid && hasBirthday }"
              >
                <template #trigger>
                  <Button
                    class="profile-edit-form__date-picker-button"
                    expand
                    :class="{ error: !birthdayValidation.valid && hasBirthday }"
                  >
                    {{ birthdayButtonLabel }}
                    <template #end>
                      <Icon name="ph:calendar" />
                    </template>
                  </Button>
                </template>
              </Calendar>
              <Button
                v-if="hasBirthday"
                variant="link"
                square
                data-title-left="Clear birthday"
                @click="clearBirthday"
              >
                <Icon name="ph:x" />
              </Button>
            </Flex>
            <span v-if="!birthdayValidation.valid && hasBirthday" class="text-xs text-color-red">
              {{ birthdayValidation.error }}
            </span>
            <div v-else class="help-text">
              <Icon name="ph:info" />
              Optional; not shown publicly if left blank.
            </div>
          </Flex>
          <Flex expand class="profile-edit-form__country-container">
            <Select
              v-model="countrySelectModel"
              expand
              name="country"
              label="Country"
              placeholder="Select your country (optional)"
              single
              search
              show-clear
              :options="COUNTRY_SELECT_OPTIONS"
              :errors="countryValidation.valid ? undefined : [countryValidation.error ?? 'Please select a valid country']"
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

      <!-- Tips -->
      <Flex column gap="s" class="profile-tips" expand>
        <h5>Tips</h5>
        <ul class="tips-list">
          <li>
            <Icon name="ph:check-circle" />
            You can use @username to mention other users in your profile
          </li>
          <li>
            <Icon name="ph:warning-circle" />
            HTML tags are not allowed and will be removed for security
          </li>
          <li>
            <Icon name="ph:warning-circle" />
            H1 tags will be converted to H2
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
  &__website-container,
  &__birthday-container,
  &__country-container {
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
