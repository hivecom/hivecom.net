<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Calendar, Flex, Input, Select, Sheet, Switch, Textarea, Tooltip } from '@dolanske/vui'
import { computed, nextTick, ref, watch } from 'vue'
import BannerEditor from '@/components/Profile/Banner/BannerEditor.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { normalizeWebsiteUrl, useUserFormValidation } from '@/composables/useUserFormValidation'
import { useBreakpoint } from '@/lib/mediaQuery'
import { deleteUserAvatar, getUserAvatarUrl, uploadUserAvatar } from '@/lib/storage'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'
import { COUNTRY_SELECT_OPTIONS } from '@/lib/utils/country'
import { formatDateOnly } from '@/lib/utils/date'
import { replaceMarkdownH1, stripHtmlTags } from '@/lib/utils/sanitize'
import RichTextEditor from '../Editor/RichTextEditor.vue'
import FileUpload from '../Shared/FileUpload.vue'

const props = defineProps<{
  profile: Tables<'profiles'> | null
  isOpen: boolean
  submissionError?: string | null
}>()
// Define emits
const emit = defineEmits<{
  'save': [profile: Partial<Tables<'profiles'>>]
  'close': []
  'update:isOpen': [value: boolean]
  'clearError': []
  'profilePatch': [patch: Partial<Tables<'profiles'>>]
}>()

// Form state
const profileForm = ref({
  username: '',
  introduction: '',
  markdown: '',
  website: '',
  country: '',
  birthday: '',
  public: true,
})

type CountrySelectOption = (typeof COUNTRY_SELECT_OPTIONS)[number]

const submissionErrorRef = computed(() => props.submissionError)

const {
  usernameValidation,
  markdownValidation,
  websiteValidation,
  countryValidation,
  birthdayValidation,
  isValid,
} = useUserFormValidation(profileForm, { submissionError: submissionErrorRef })

// Avatar upload state
const avatarUploading = ref(false)
const avatarError = ref<string | null>(null)

// Banner state
const bannerEditorOpen = ref(false)
const bannerUrl = ref<string | null>(null)
const bannerDeleting = ref(false)
const importFileRef = ref<HTMLInputElement | null>(null)
const bannerEditorRef = ref<{ importBanner: (file: File) => Promise<{ hadMetadata: boolean }> } | null>(null)
const sheetContentRef = ref<{ $el: HTMLElement } | null>(null)
const bannerUploading = ref(false)
const showBannerDeleteConfirm = ref(false)
const showImportConfirm = ref(false)

// When the banner editor closes, focus back into the sheet so the Radix
// focusOutside handler doesn't see focus leaving and dismiss the sheet.
watch(bannerEditorOpen, (isOpen) => {
  if (!isOpen) {
    nextTick(() => {
      sheetContentRef.value?.$el?.focus({ preventScroll: true })
    })
  }
})

function onBannerSaved(url: string) {
  bannerUrl.value = `${url}?t=${Date.now()}`
  emit('profilePatch', { has_banner: true })
}

function onBannerDeleted() {
  bannerUrl.value = null
  emit('profilePatch', { has_banner: false })
}

async function handleImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so the same file can be re-selected next time
  input.value = ''
  if (!file || !props.profile?.id)
    return

  // Check for embedded metadata without touching the editor
  const bytes = new Uint8Array(await file.arrayBuffer())
  const text = new TextDecoder().decode(bytes)
  const hasMetadata = text.includes('<!-- HIVECOM_BANNER_META:')

  if (hasMetadata) {
    // Upload the file directly - no need to re-render through the editor
    try {
      bannerUploading.value = true
      const supabase = useSupabaseClient()
      const filePath = `${props.profile.id}/banner.webp`

      await supabase.storage
        .from(USERS_BUCKET_ID)
        .upload(filePath, file, { upsert: true, contentType: 'image/webp' })

      await supabase
        .from('profiles')
        .update({ has_banner: true })
        .eq('id', props.profile.id)

      const { data } = supabase.storage.from(USERS_BUCKET_ID).getPublicUrl(filePath)
      bannerUrl.value = `${data.publicUrl}?t=${Date.now()}`
      emit('profilePatch', { has_banner: true })
    }
    catch (error) {
      console.error('Error uploading imported banner:', error)
    }
    finally {
      bannerUploading.value = false
    }
  }
  else {
    // No metadata - load as an image layer and let the user edit first
    await bannerEditorRef.value?.importBanner(file)
    bannerEditorOpen.value = true
  }
}

function confirmImport() {
  importFileRef.value?.click()
}

async function handleBannerDelete() {
  if (!props.profile?.id)
    return

  try {
    bannerDeleting.value = true
    const supabase = useSupabaseClient()

    await supabase.storage
      .from(USERS_BUCKET_ID)
      .remove([`${props.profile.id}/banner.webp`])

    await supabase
      .from('profiles')
      .update({ has_banner: false })
      .eq('id', props.profile.id)

    bannerUrl.value = null
    emit('profilePatch', { has_banner: false })
  }
  catch (error) {
    console.error('Error deleting banner:', error)
  }
  finally {
    bannerDeleting.value = false
  }
}
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
        public: newProfile.public,
      }

      // Initialize avatar URL
      const supabase = useSupabaseClient()
      avatarUrl.value = await getUserAvatarUrl(supabase, newProfile.id)

      // Initialize banner URL from has_banner flag
      if (newProfile.has_banner) {
        const { data } = supabase.storage
          .from(USERS_BUCKET_ID)
          .getPublicUrl(`${newProfile.id}/banner.webp`)
        bannerUrl.value = `${data.publicUrl}?t=${Date.now()}`
      }
      else {
        bannerUrl.value = null
      }
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
        public: true,
      }

      avatarUrl.value = null
      bannerUrl.value = null
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
    public: profileForm.value.public,
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
const isMobile = useBreakpoint('<s')

async function confirmAvatarDelete() {
  await handleAvatarDelete()
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="792"
    @close="handleClose"
  >
    <template #header>
      <Flex column gap="xxs">
        <h4>Edit Profile</h4>
        <p v-if="props.profile" class="text-color-light text-m">
          {{ props.profile.username }}
        </p>
      </Flex>
    </template>

    <Flex ref="sheetContentRef" tabindex="-1" column gap="l" class="profile-edit-form" expand>
      <Flex gap="l" expand :column="isMobile">
        <!-- Avatar -->
        <Flex column gap="m" class="profile-edit-form__avatar-section" :expand="isMobile">
          <h4>Avatar</h4>
          <FileUpload
            expand
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

        <!-- Basic Information -->
        <Flex column gap="m" expand>
          <h4>Basic Information</h4>

          <Flex>
            <Flex y-center gap="xs">
              <Switch
                v-model="profileForm.public"
                label="Public profile"
              />
              <Tooltip placement="top">
                <Icon name="ph:info" class="public-profile-info-icon" />
                <template #tooltip>
                  <p>When enabled, anyone - including visitors who are not logged in - can view your full profile page, including your introduction, content, and other public details.</p>
                </template>
              </Tooltip>
            </Flex>
          </Flex>

          <Flex expand class="profile-edit-form__username-container">
            <Input
              v-model="profileForm.username"
              expand
              name="username"
              label="Username"
              hint="Username can only contain Latin letters, numbers, and underscores"
              required
              placeholder="Enter your username"
              :limit="USERNAME_LIMIT"
              :errors="usernameValidation.error ? [usernameValidation.error] : undefined"
            />
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
      </Flex>

      <!-- Birthday & Country -->
      <Flex gap="m" expand :column="isMobile">
        <Flex column :gap="0" expand class="profile-edit-form__birthday-container">
          <label class="vui-label">Birthday</label>
          <Flex expand gap="xs" y-center>
            <Calendar
              v-model="birthdayDateModel"
              expand
              format="yyyy-MM-dd"
              :class="{ invalid: !birthdayValidation.valid && hasBirthday }"
            >
              <template #trigger>
                <Button
                  expand
                  outline
                  :class="{ error: !birthdayValidation.valid && hasBirthday }"
                >
                  <template #start>
                    <Icon name="ph:calendar" :size="18" />
                  </template>
                  {{ birthdayButtonLabel }}
                </Button>
              </template>
            </Calendar>
            <Tooltip v-if="hasBirthday">
              <Button
                square
                outline
                @click="clearBirthday"
              >
                <Icon name="ph:x" />
              </Button>
              <template #tooltip>
                <p>Clear birthday</p>
              </template>
            </Tooltip>
          </Flex>
          <span v-if="!birthdayValidation.valid && hasBirthday" class="vui-error">
            {{ birthdayValidation.error }}
          </span>
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

      <!-- About Section -->
      <Flex column gap="m" expand>
        <h4>About</h4>

        <Textarea
          v-model="profileForm.introduction"
          expand
          name="introduction"
          label="Introduction"
          placeholder="A brief introduction about yourself (optional)"
          :rows="3"
          :limit="INTRODUCTION_LIMIT"
        />

        <RichTextEditor
          v-model="profileForm.markdown"
          :media-context="props.profile?.id ? `${props.profile.id}/markdown/media` : undefined"
          :media-bucket-id="USERS_BUCKET_ID"
          placeholder="Tell others about yourself!"
          label="Content"
          :limit="MARKDOWN_LIMIT"
          :errors="markdownValidation.error ? [markdownValidation.error] : undefined"
          :show-attachment-button="!!props.profile?.id"
          show-expand-button
        />

        <!-- Banner / Signature -->
        <Flex column gap="s" expand>
          <label class="profile-edit-form__banner-label">Forum Signature</label>

          <div class="profile-edit-form__signature-mobile-notice">
            <Alert variant="info">
              Forum signature editing requires a desktop or tablet - please switch to a larger device.
            </Alert>
          </div>

          <div class="profile-edit-form__signature-editor">
            <Flex v-if="bannerUrl" expand class="profile-edit-form__banner-wrapper">
              <img
                :src="bannerUrl"
                alt="Your forum banner"
                class="profile-edit-form__banner-preview"
              >
              <div class="profile-edit-form__banner-overlay">
                <Button size="s" variant="gray" @click="bannerEditorOpen = true">
                  <template #start>
                    <Icon name="ph:pencil-simple" />
                  </template>
                  Edit
                </Button>
                <Button size="s" variant="danger" :loading="bannerDeleting" @click="showBannerDeleteConfirm = true">
                  <template #start>
                    <Icon name="ph:trash" />
                  </template>
                  Delete
                </Button>
              </div>
            </Flex>

            <Flex v-else gap="xs">
              <Button
                :disabled="!props.profile"
                @click="bannerEditorOpen = true"
              >
                <template #start>
                  <Icon name="ph:plus" />
                </template>
                Create Signature
              </Button>
              <Button
                variant="gray"
                :disabled="!props.profile"
                title="Import an existing .webp banner file"
                @click="showImportConfirm = true"
              >
                <template #start>
                  <Icon name="ph:upload-simple" />
                </template>
                Import
              </Button>
              <input
                ref="importFileRef"
                type="file"
                accept="image/webp"
                class="profile-edit-form__import-input"
                @change="handleImportFile"
              >
            </Flex>
          </div>
        </Flex>
      </Flex>

      <!-- Tips -->
      <!-- TODO: move these into a tooltip below/above profile content -->
      <!-- <Flex column gap="s" class="profile-tips" expand>
        <h5>Tips</h5>
        <ul class="tips-list">
          <li>
            <Icon name="ph:info" />
            You can use @username to mention other users in your profile
          </li>
          <li>
            <Icon name="ph:info" />
            You can apply advanced formatting by selecting text or using keyboard shortcuts. You can also use Markdown syntax directly
          </li>
          <li>
            <Icon name="ph:info" />
            Paste or drop images directly into the editor
          </li>
        </ul>
      </Flex> -->
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

    <!-- Banner Editor Modal -->
    <BannerEditor
      v-if="bannerEditorOpen"
      ref="bannerEditorRef"
      :open="bannerEditorOpen"
      :user-id="props.profile?.id ?? null"
      @saved="onBannerSaved"
      @deleted="onBannerDeleted"
      @close="bannerEditorOpen = false"
    />

    <!-- Delete Banner Confirmation Modal -->
    <ConfirmModal
      v-model:open="showBannerDeleteConfirm"
      :confirm="handleBannerDelete"
      title="Delete Signature"
      description="Are you sure you want to delete your forum signature? This cannot be undone."
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />

    <!-- Import Banner Confirmation Modal -->
    <ConfirmModal
      v-model:open="showImportConfirm"
      :confirm="confirmImport"
      title="Import Signature"
      description="This will load the selected file into the signature editor."
      confirm-text="Import"
      cancel-text="Cancel"
    >
      <Alert variant="danger" title="Only import files from sources you trust">
        <p class="text-s">
          <br> Hivecom banner files can contain embedded editor metadata. While we parse it carefully, importing a file that was sent to you by someone else at their request carries a small inherent risk. When in doubt, don't import it.
        </p>
      </Alert>
    </ConfirmModal>

    <!-- Delete Avatar Confirmation Modal -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmAvatarDelete"
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

  &__avatar-section {
    @media (max-width: 768px) {
      width: 100%;

      :deep(.file-upload) {
        width: 100%;
        max-width: 100%;
      }

      :deep(.file-upload__drop-zone--avatar) {
        width: 100%;
        height: auto;
        aspect-ratio: 1/1;
      }
    }
  }

  &__avatar-container {
    .avatar-preview {
      &__image {
        width: 64px;
        height: 64px;
        border-radius: var(--border-radius-pill);
        object-fit: cover;
        border: 2px solid var(--color-border);
      }

      &__placeholder {
        width: 64px;
        height: 64px;
        border-radius: var(--border-radius-pill);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px dashed var(--color-border);
        color: var(--color-text-light);
        font-size: var(--font-size-m);
      }
    }
  }

  .public-profile-info-icon {
    color: var(--color-text-lighter);
    font-size: var(--font-size-m);
    cursor: help;

    &:hover {
      color: var(--color-text);
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

  &__signature-mobile-notice {
    width: 100%;
    display: none;

    @media (max-width: 767px) {
      display: block;
    }
  }

  &__signature-editor {
    width: 100%;
    @media (max-width: 767px) {
      display: none;
    }
  }

  &__banner-label {
    display: block;
    text-align: left;
    font-size: var(--font-size-m);
    color: var(--color-text);
  }

  &__banner-wrapper {
    position: relative;
    border-radius: var(--border-radius-s);
    overflow: hidden;
    border: 1px solid var(--color-border);

    &:hover .profile-edit-form__banner-overlay {
      opacity: 1;
    }
  }

  &__banner-preview {
    display: block;
    width: 100%;
    aspect-ratio: 728 / 36;
    height: auto;
    object-fit: cover;
  }

  &__import-input {
    display: none;
  }

  &__banner-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-s);
    opacity: 0;
    background: color-mix(in srgb, var(--color-bg) 60%, transparent);
    transition: opacity var(--transition);
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
