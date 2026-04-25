<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Calendar, Flex, Input, Modal, Select, Sheet, Switch, Textarea, Tooltip } from '@dolanske/vui'
import { computed, nextTick, ref, watch } from 'vue'
import BannerEditor from '@/components/Profile/Banner/BannerEditor.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
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

const isMobile = useBreakpoint('<s')

// Banner state
const bannerEditorOpen = ref(false)
const bannerUrl = ref<string | null>(null)
const bannerDeleting = ref(false)
const bannerError = ref<string | null>(null)
const avatarUploadRef = ref<{ openFileDialog: () => void } | null>(null)
const importFileRef = ref<HTMLInputElement | null>(null)
const importAnimatedRef = ref<HTMLInputElement | null>(null)
const bannerEditorRef = ref<{ importBanner: (file: File) => Promise<{ hadMetadata: boolean }> } | null>(null)
const sheetContentRef = ref<{ $el: HTMLElement } | null>(null)
const bannerUploading = ref(false)
const showBannerDeleteConfirm = ref(false)
const showImportConfirm = ref(false)
const showFfmpegInfo = ref(false)

const BANNER_TIPS_MD = `
These commands use [FFmpeg](https://ffmpeg.org/download.html) - a free command-line tool available for Windows, macOS, and Linux. Ideal banner size is **728x36px**, max **1MB**.

**Image - crop/scale to WebP (recommended)**
\`\`\`bash
ffmpeg -i input.png -vf "scale=728:36:force_original_aspect_ratio=increase,crop=728:36" -quality 80 output.webp
\`\`\`

**Video - crop/scale to WebM (target under 1MB)**
\`\`\`bash
ffmpeg -i input.mp4 -vf "scale=728:36:force_original_aspect_ratio=increase,crop=728:36,fps=15" -c:v libvpx-vp9 -b:v 200k -an -t 10 -loop 0 output.webm
\`\`\`

**Video - crop/scale to GIF (target under 1MB)**
\`\`\`bash
ffmpeg -i input.mp4 -vf "scale=728:36:force_original_aspect_ratio=increase,crop=728:36,fps=10,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -t 10 -loop 0 output.gif
\`\`\`

</br>

> WebM and GIF loop automatically in the browser. \`-loop 0\` sets infinite looping in the file itself as a fallback.

<details>
<summary>Trimming and looping techniques</summary>

**Trim a clip before converting (optional)**
\`\`\`bash
ffmpeg -i input.mp4 -ss 00:00:01 -t 00:00:05 -vf "scale=728:36:force_original_aspect_ratio=increase,crop=728:36,fps=15" -c:v libvpx-vp9 -b:v 200k -an -loop 0 output.webm
\`\`\`

**Ping-pong (boomerang) loop - WebM**
\`\`\`bash
ffmpeg -i input.mp4 -vf "scale=728:36:force_original_aspect_ratio=increase,crop=728:36,fps=15,split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1" -c:v libvpx-vp9 -b:v 200k -an -loop 0 output.webm
\`\`\`

**Ping-pong (boomerang) loop - GIF**
\`\`\`bash
ffmpeg -i input.mp4 -vf "scale=728:36:force_original_aspect_ratio=increase,crop=728:36,fps=10,split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -t 10 -loop 0 output.gif
\`\`\`

> Ping-pong works by duplicating the clip in reverse and concatenating it - forward then backward - so it loops seamlessly without a hard cut. The \`reverse\` filter requires the full clip to be buffered, so keep source clips short (under 5s) to avoid high memory use.

</details>

<details>
<summary>Key parameters explained</summary>

| Parameter | What it does |
|---|---|
| \`scale=728:36\` | Target width and height in pixels. |
| \`force_original_aspect_ratio=increase\` | Scales up so the smallest dimension meets the target - prevents black bars. |
| \`crop=728:36\` | Crops the center to exactly 728x36. Shift the crop point with \`:x:y\` - e.g. \`crop=728:36:0:0\` crops from the top-left. |
| \`fps=15\` | Frames per second. Lower reduces file size - try 10 for GIFs. |
| \`-b:v 200k\` | Target video bitrate. Lower keeps file size down - raise for better quality if under 1MB. |
| \`-t 10\` | Limit output to 10 seconds. Shorter clips are much smaller. |
| \`-ss 00:00:01\` | Start time - skip this many seconds into the source before encoding. |
| \`-an\` | Strip audio - banners are silent so this saves space. |
| \`-quality 80\` | WebP quality 0-100. 80 balances sharpness and file size. |

</details>
`.trim()

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

const BANNER_MAX_SIZE = 1 * 1024 * 1024 // 1MB

async function handleAnimatedFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.profile?.id)
    return

  bannerError.value = null

  if (file.size > BANNER_MAX_SIZE) {
    bannerError.value = 'File must be under 1MB.'
    return
  }

  const ext = file.type === 'video/webm' ? 'webm' : 'gif'
  try {
    bannerUploading.value = true
    const supabase = useSupabaseClient()
    const filePath = `${props.profile.id}/banner.${ext}`

    // Remove stale banner files with other extensions
    const otherExts = ['webp', 'webm', 'gif'].filter(e => e !== ext)
    await Promise.all(otherExts.map(e =>
      supabase.storage.from(USERS_BUCKET_ID).remove([`${props.profile!.id}/banner.${e}`]),
    ))

    await supabase.storage
      .from(USERS_BUCKET_ID)
      .upload(filePath, file, { upsert: true, contentType: file.type })

    await supabase
      .from('profiles')
      .update({ has_banner: true, banner_extension: ext })
      .eq('id', props.profile.id)

    const { data } = supabase.storage.from(USERS_BUCKET_ID).getPublicUrl(filePath)
    bannerUrl.value = `${data.publicUrl}?t=${Date.now()}`
    emit('profilePatch', { has_banner: true, banner_extension: ext })
  }
  catch (error) {
    console.error('Error uploading animated banner:', error)
    bannerError.value = 'Failed to upload banner.'
  }
  finally {
    bannerUploading.value = false
  }
}

async function handleImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so the same file can be re-selected next time
  input.value = ''
  if (!file || !props.profile?.id)
    return

  bannerError.value = null

  if (file.size > BANNER_MAX_SIZE) {
    bannerError.value = 'File must be under 1MB.'
    return
  }

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

      // Remove stale animated banner files if any
      await Promise.all(['webm', 'gif'].map(e =>
        supabase.storage.from(USERS_BUCKET_ID).remove([`${props.profile!.id}/banner.${e}`]),
      ))

      await supabase.storage
        .from(USERS_BUCKET_ID)
        .upload(filePath, file, { upsert: true, contentType: 'image/webp' })

      await supabase
        .from('profiles')
        .update({ has_banner: true, banner_extension: 'webp' })
        .eq('id', props.profile.id)

      const { data } = supabase.storage.from(USERS_BUCKET_ID).getPublicUrl(filePath)
      bannerUrl.value = `${data.publicUrl}?t=${Date.now()}`
      emit('profilePatch', { has_banner: true, banner_extension: 'webp' })
    }
    catch (error) {
      console.error('Error uploading imported banner:', error)
      bannerError.value = 'Failed to upload banner.'
    }
    finally {
      bannerUploading.value = false
    }
  }
  else if (isMobile.value) {
    // On mobile skip the editor - upload the plain image directly as webp
    try {
      bannerUploading.value = true
      const supabase = useSupabaseClient()
      const filePath = `${props.profile.id}/banner.webp`

      await Promise.all(['webm', 'gif'].map(e =>
        supabase.storage.from(USERS_BUCKET_ID).remove([`${props.profile!.id}/banner.${e}`]),
      ))

      await supabase.storage
        .from(USERS_BUCKET_ID)
        .upload(filePath, file, { upsert: true, contentType: file.type })

      await supabase
        .from('profiles')
        .update({ has_banner: true, banner_extension: 'webp' })
        .eq('id', props.profile.id)

      const { data } = supabase.storage.from(USERS_BUCKET_ID).getPublicUrl(filePath)
      bannerUrl.value = `${data.publicUrl}?t=${Date.now()}`
      emit('profilePatch', { has_banner: true, banner_extension: 'webp' })
    }
    catch (error) {
      console.error('Error uploading banner on mobile:', error)
      bannerError.value = 'Failed to upload banner.'
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

function openAnimatedUpload() {
  importAnimatedRef.value?.click()
}

async function handleBannerDelete() {
  if (!props.profile?.id)
    return

  try {
    bannerDeleting.value = true
    const supabase = useSupabaseClient()

    // Remove all possible banner extensions
    await Promise.all(['webp', 'webm', 'gif'].map(e =>
      supabase.storage.from(USERS_BUCKET_ID).remove([`${props.profile!.id}/banner.${e}`]),
    ))

    await supabase
      .from('profiles')
      .update({ has_banner: false, banner_extension: null })
      .eq('id', props.profile.id)

    bannerUrl.value = null
    emit('profilePatch', { has_banner: false, banner_extension: null })
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

      // Update each field individually - skip markdown if unchanged to avoid
      // Tiptap crashing with a RangeError when the editor doc is replaced while
      // the cursor is at a position that no longer exists after the content swap.
      profileForm.value.username = newProfile.username
      profileForm.value.introduction = newProfile.introduction || ''
      profileForm.value.website = (newProfile as Tables<'profiles'> & { website?: string }).website || ''
      profileForm.value.country = hasValidCountry ? normalizedCountry : ''
      profileForm.value.birthday = newProfile.birthday || ''
      profileForm.value.public = newProfile.public
      const incomingMarkdown = newProfile.markdown || ''
      if (profileForm.value.markdown !== incomingMarkdown) {
        profileForm.value.markdown = incomingMarkdown
      }

      // Initialize avatar URL
      const supabase = useSupabaseClient()
      avatarUrl.value = await getUserAvatarUrl(supabase, newProfile.id)

      // Initialize banner URL from has_banner flag
      if (newProfile.has_banner) {
        const ext = newProfile.banner_extension ?? 'webp'
        const { data } = supabase.storage
          .from(USERS_BUCKET_ID)
          .getPublicUrl(`${newProfile.id}/banner.${ext}`)
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
            ref="avatarUploadRef"
            expand
            variant="avatar"
            label="Upload Avatar"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,video/webm"
            :max-size-m-b="1"
            :preview-url="avatarUrl"
            :loading="avatarUploading"
            :deleting="avatarDeleting"
            :error="avatarError"
            :show-delete="!!avatarUrl"
            @upload="handleAvatarUpload"
            @remove="handleAvatarRemove"
            @delete="handleAvatarDeleteConfirm"
            @invalid="(msg) => avatarError = msg"
          />
          <!-- Mobile avatar actions - shown below avatar for touch accessibility -->
          <Flex v-if="isMobile && avatarUrl" expand gap="xs" class="profile-edit-form__avatar-mobile-actions">
            <Button
              expand
              variant="accent"
              :loading="avatarUploading"
              @click="avatarUploadRef?.openFileDialog()"
            >
              <template #start>
                <Icon name="ph:upload" />
              </template>
              Replace Avatar
            </Button>
            <Button
              expand
              variant="danger"
              :loading="avatarDeleting"
              @click="handleAvatarDeleteConfirm"
            >
              <template #start>
                <Icon name="ph:trash" />
              </template>
              Delete Avatar
            </Button>
          </Flex>
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
          <Flex x-between y-center expand>
            <label class="profile-edit-form__banner-label">Forum Signature</label>
            <Flex gap="xs" y-center>
              <span class="text-s text-color-lighter">Suggested size is 728x36px</span>
              <Button size="s" variant="gray" outline @click="showFfmpegInfo = true">
                <template #start>
                  <Icon name="ph:info" />
                </template>
                Media tips
              </Button>
            </Flex>
          </Flex>

          <div class="profile-edit-form__signature-editor">
            <Alert v-if="isMobile" variant="info" class="profile-edit-form__signature-mobile-notice">
              Forum signature editing requires a desktop or tablet - please switch to a larger device.
            </Alert>
            <input
              ref="importAnimatedRef"
              type="file"
              accept="video/webm,image/gif"
              class="profile-edit-form__import-input"
              @change="handleAnimatedFile"
            >
            <input
              ref="importFileRef"
              type="file"
              accept="image/*"
              class="profile-edit-form__import-input"
              @change="handleImportFile"
            >
            <Flex v-if="bannerUrl" expand class="profile-edit-form__banner-wrapper">
              <video
                v-if="props.profile?.banner_extension === 'webm'"
                :src="bannerUrl"
                class="profile-edit-form__banner-preview"
                autoplay
                loop
                muted
                playsinline
              />
              <img
                v-else
                :src="bannerUrl"
                alt="Your forum banner"
                class="profile-edit-form__banner-preview"
              >
              <div class="profile-edit-form__banner-overlay">
                <Button
                  v-if="props.profile?.banner_extension === 'webp'"
                  size="s"
                  variant="gray"
                  :disabled="isMobile"
                  @click="!isMobile && (bannerEditorOpen = true)"
                >
                  <template #start>
                    <Icon name="ph:pencil-simple" />
                  </template>
                  Edit
                </Button>
                <Button
                  v-else
                  size="s"
                  variant="gray"
                  @click="openAnimatedUpload"
                >
                  <template #start>
                    <Icon name="ph:arrows-clockwise" />
                  </template>
                  Replace
                </Button>
                <Button size="s" variant="danger" :loading="bannerDeleting" @click="showBannerDeleteConfirm = true">
                  <template #start>
                    <Icon name="ph:trash" />
                  </template>
                  Delete
                </Button>
              </div>
            </Flex>

            <Flex v-else column gap="xs">
              <Flex :column="isMobile" gap="xs" expand :wrap="!isMobile">
                <Button
                  :expand="isMobile"
                  :disabled="!props.profile || isMobile"
                  @click="bannerEditorOpen = true"
                >
                  <template #start>
                    <Icon name="ph:plus" />
                  </template>
                  Create Signature
                </Button>
                <Button
                  variant="gray"
                  :expand="isMobile"
                  :disabled="!props.profile"
                  title="Upload a GIF or WebM as your banner"
                  @click="openAnimatedUpload"
                >
                  <template #start>
                    <Icon name="ph:gif" />
                  </template>
                  Upload GIF / WebM
                </Button>
                <Button
                  variant="gray"
                  :expand="isMobile"
                  :disabled="!props.profile"
                  title="Import a plain image or an existing .webp banner file - ideal dimensions are 728x36px"
                  @click="showImportConfirm = true"
                >
                  <template #start>
                    <Icon name="ph:upload-simple" />
                  </template>
                  Import Image / Existing Banner
                </Button>
              </Flex>
              <p v-if="bannerError" class="profile-edit-form__banner-error">
                {{ bannerError }}
              </p>
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

    <!-- Banner Media Tips Modal -->
    <Modal :open="showFfmpegInfo" size="l" centered scrollable @close="showFfmpegInfo = false">
      <template #header>
        <h4>Banner media tips</h4>
      </template>

      <Flex column gap="m">
        <MarkdownRenderer :md="BANNER_TIPS_MD" skeleton-height="0px" />

        <Flex column gap="xs">
          <span class="text-s text-bold">Banner font</span>
          <p class="text-s text-color-lighter">
            The default banner font used in the editor is Visitor BRK. Download it to use in external tools.
          </p>
          <div>
            <a href="/fonts/visitorbrk.ttf" download="visitorbrk.ttf">
              <Button variant="gray" size="s">
                <template #start>
                  <Icon name="ph:download-simple" />
                </template>
                Download Visitor BRK (.ttf)
              </Button>
            </a>
          </div>
        </Flex>
      </Flex>

      <template #footer="{ close }">
        <Flex x-end>
          <Button @click="close">
            Close
          </Button>
        </Flex>
      </template>
    </Modal>

    <!-- Import Banner Confirmation Modal -->
    <ConfirmModal
      v-model:open="showImportConfirm"
      :confirm="confirmImport"
      title="Import Signature"
      description="This will load the selected file into the signature editor. For best results, use an image that is 728x36px."
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

      :deep(.file-upload__preview--avatar) {
        width: 100%;
        height: auto;
        aspect-ratio: 1/1;

        .file-upload__image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }
    }
  }

  &__avatar-mobile-actions {
    width: 100%;
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
    margin-bottom: var(--space-xs);
  }

  &__signature-editor {
    width: 100%;
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

  &__banner-error {
    font-size: var(--font-size-xs);
    color: var(--color-text-red);
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
