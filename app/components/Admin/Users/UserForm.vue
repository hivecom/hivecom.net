<script setup lang="ts">
import type { UserFormState } from '@/composables/useUserFormValidation'
import type { Enums } from '@/types/database.types'
import { Button, Calendar, Flex, Input, Select, Sheet, Switch, Textarea, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import ProfileBadgeBuilder from '@/components/Profile/Badges/ProfileBadgeBuilder.vue'
import ProfileBadgeEarlybird from '@/components/Profile/Badges/ProfileBadgeEarlybird.vue'
import ProfileBadgeFounder from '@/components/Profile/Badges/ProfileBadgeFounder.vue'
import ProfileBadgeHost from '@/components/Profile/Badges/ProfileBadgeHost.vue'
import AvatarDelete from '@/components/Shared/AvatarDelete.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { INTRODUCTION_LIMIT, MARKDOWN_LIMIT, normalizeWebsiteUrl, USERNAME_LIMIT, useUserFormValidation } from '@/composables/useUserFormValidation'
import { deleteUserAvatar, getUserAvatarUrl } from '@/lib/storage'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'
import { COUNTRY_SELECT_OPTIONS } from '@/lib/utils/country'
import { formatDateOnly } from '@/lib/utils/date'
import { stripHtmlTags } from '@/lib/utils/sanitize'

const props = defineProps<{
  user: {
    id: string
    username: string
    created_at: string
    supporter_patreon: boolean
    supporter_lifetime: boolean

    patreon_id: string | null
    discord_id: string | null
    steam_id: string | null
    introduction: string | null
    markdown: string | null
    banned: boolean
    ban_duration?: string
    roles?: string[]
    country?: string | null
    birthday?: string | null
    badges?: ProfileBadge[]
    website?: string | null
    public?: boolean
  } | null
  isEditMode: boolean
}>()
// Define emits
const emit = defineEmits(['save', 'delete'])
// Interface for Select options
interface SelectOption {
  label: string
  value: string
  description?: string
}

type ProfileBadge = Enums<'profile_badge'>

const BADGE_VALUES = ['builder', 'earlybird', 'founder', 'host'] as const satisfies ReadonlyArray<ProfileBadge>

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get current user and admin permissions
const currentUser = useSupabaseUser()
const currentUserId = useUserId()
const { canModifyUsers, canDeleteUsers, canUpdateRoles } = useAdminPermissions()

// Supabase client for role operations
const supabase = useSupabaseClient()

// Avatar state
const avatarUrl = ref<string | null>(null)
const avatarDeleting = ref(false)

// Form state
function createDefaultUserFormState(): UserFormState {
  return {
    username: '',
    introduction: '',
    markdown: '',
    website: '',
    country: '',
    birthday: '',
    public: true,
    supporter_patreon: false,
    supporter_lifetime: false,
    patreon_id: '',
    discord_id: '',
    steam_id: '',
    badges: [],
  }
}

const userForm = ref<UserFormState>(createDefaultUserFormState())

const {
  usernameValidation,
  patreonIdValidation,
  discordIdValidation,
  steamIdValidation,
  markdownValidation,
  introductionValidation,
  websiteValidation,
  countryValidation,
  birthdayValidation,
  isValid,
} = useUserFormValidation(userForm)

// Available roles - "User" means no role in database
const availableRoles = [
  { value: 'user', label: 'User', description: 'Standard user with no admin privileges' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access' },
  { value: 'moderator', label: 'Moderator', description: 'Content moderation privileges' },
] as const

const BADGE_DESCRIPTIONS: Record<ProfileBadge, string> = {
  builder: 'Contributed to open-source projects and infrastructure',
  earlybird: 'Joined in the early days of the community',
  founder: 'One of the original founders',
  host: 'Hosted or organized multiple events for the community',
}

function formatBadgeLabel(badge: ProfileBadge) {
  return badge
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const badgeLabelMap = BADGE_VALUES.reduce<Record<ProfileBadge, string>>((acc, badge) => {
  acc[badge] = formatBadgeLabel(badge)
  return acc
}, {} as Record<ProfileBadge, string>)

const BADGE_COMPONENTS: Record<ProfileBadge, unknown> = {
  builder: ProfileBadgeBuilder,
  earlybird: ProfileBadgeEarlybird,
  founder: ProfileBadgeFounder,
  host: ProfileBadgeHost,
}

// Convert roles to Select component options format
const roleSelectOptions = computed(() =>
  availableRoles.map(role => ({
    label: role.label,
    value: role.value,
  })),
)

// Role management state
const selectedRole = ref<string>('user')
const originalRole = ref<string>('user')
const rolesLoading = ref(false)
const rolesError = ref('')

// Permission verification state
const permissionVerified = ref(false)
const permissionVerifying = ref(false)

// Computed property to handle VUI Select format (expects array of selected options)
const selectedRoleComputed = computed({
  get: (): SelectOption[] => {
    const option = roleSelectOptions.value.find(opt => opt.value === selectedRole.value)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    selectedRole.value = (value && value.length > 0 && value[0]) ? value[0].value : 'user'
  },
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

function dedupeBadges(badges?: readonly ProfileBadge[]) {
  return [...new Set(badges ?? [])] as ProfileBadge[]
}

function isBadgeActive(badge: ProfileBadge): boolean {
  return userForm.value.badges.includes(badge)
}

function toggleBadge(badge: ProfileBadge) {
  if (isBadgeActive(badge))
    userForm.value.badges = userForm.value.badges.filter(b => b !== badge)
  else
    userForm.value.badges = dedupeBadges([...userForm.value.badges, badge])
}

const badgeSummaryText = computed(() => {
  if (!userForm.value.badges.length)
    return 'No badges assigned'

  const labels = userForm.value.badges.map(badge => badgeLabelMap[badge] ?? formatBadgeLabel(badge))
  return `Assigned badges: ${labels.join(', ')}`
})

// Permission-based access control
const canEditForm = computed(() => {
  if (!props.isEditMode)
    return canModifyUsers.value // Creating new user
  return canModifyUsers.value // Editing existing user
})

const canEditRoles = computed(() => {
  // Basic permission check from the admin permissions composable
  if (!canUpdateRoles.value) {
    return false
  }

  // Additional database verification check
  if (!permissionVerified.value) {
    return false
  }

  // Prevent users from modifying their own role
  if (currentUser.value && props.user && currentUserId.value === props.user.id) {
    return false
  }

  return true
})

const canDeleteUser = computed(() => canDeleteUsers.value)

const showDeleteButton = computed(() => props.isEditMode && canDeleteUser.value)

// Role management functions
async function fetchUserRoles() {
  if (!props.user?.id)
    return

  rolesLoading.value = true
  rolesError.value = ''

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', props.user.id)

    if (error)
      throw error

    // If user has a role in the database, use it; otherwise default to 'user'
    const role = data?.[0]?.role || 'user'
    selectedRole.value = role
    originalRole.value = role
  }
  catch (error) {
    console.error('Error fetching user roles:', error)
    rolesError.value = 'Failed to load user roles'
  }
  finally {
    rolesLoading.value = false
  }
}

// Verify that the current user has the required permissions to modify roles
async function verifyRolePermissions() {
  if (!currentUser.value) {
    permissionVerified.value = false
    return
  }

  permissionVerifying.value = true

  try {
    // Get the current user's role
    const { data: userRoleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUserId.value)
      .single()

    if (roleError && roleError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw roleError
    }

    const userRole = userRoleData?.role

    if (!userRole) {
      permissionVerified.value = false
      return
    }

    // Check if the user's role has the required permissions
    const { data: permissionData, error: permissionError } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role', userRole)
      .in('permission', ['roles.update', 'roles.create'])

    if (permissionError) {
      throw permissionError
    }

    permissionVerified.value = permissionData && permissionData.length > 0
  }
  catch (error) {
    console.error('Error verifying role permissions:', error)
    permissionVerified.value = false
  }
  finally {
    permissionVerifying.value = false
  }
}

// Update form data when user prop changes
watch(
  () => props.user,
  async (newUser) => {
    if (newUser) {
      const normalizedCountry = newUser.country?.toUpperCase() ?? ''
      const hasValidCountry = COUNTRY_SELECT_OPTIONS.some(option => option.value === normalizedCountry)
      const sanitizedBadges = dedupeBadges(newUser.badges)

      userForm.value = {
        username: newUser.username,
        introduction: newUser.introduction || '',
        markdown: newUser.markdown || '',
        website: newUser.website || '',
        country: hasValidCountry ? normalizedCountry : '',
        birthday: newUser.birthday || '',
        public: newUser.public ?? true,
        supporter_patreon: newUser.supporter_patreon,
        supporter_lifetime: newUser.supporter_lifetime,
        patreon_id: newUser.patreon_id || '',
        discord_id: newUser.discord_id || '',
        steam_id: newUser.steam_id || '',
        badges: sanitizedBadges,
      }

      // Fetch user roles when editing existing user
      if (props.isEditMode) {
        fetchUserRoles()
      }
      // Fetch user avatar when editing existing user
      if (props.isEditMode && newUser.id) {
        avatarUrl.value = await getUserAvatarUrl(supabase, newUser.id)
      }
      // Verify role permissions when user changes
      verifyRolePermissions()
    }
    else {
      // Reset form for new user
      userForm.value = createDefaultUserFormState()
      // Reset role for new user
      selectedRole.value = 'user'
      originalRole.value = 'user'
      // Reset avatar for new user
      avatarUrl.value = null
      // Verify permissions for new user creation
      verifyRolePermissions()
    }
  },
  { immediate: true },
)

// Watch for authentication state changes to re-verify permissions
watch(
  () => currentUser.value,
  () => {
    verifyRolePermissions()
  },
  { immediate: true },
)

watch(
  () => isOpen.value,
  (open) => {
    if (!open) {
      deleteLoading.value = false
      showDeleteConfirm.value = false
    }
  },
)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  // Prepare the data to save with HTML sanitization
  const userData = {
    username: userForm.value.username.trim(),
    introduction: userForm.value.introduction.trim() ? stripHtmlTags(userForm.value.introduction.trim()) : null,
    markdown: userForm.value.markdown.trim() ? stripHtmlTags(userForm.value.markdown.trim()) : null,
    website: userForm.value.website.trim() ? normalizeWebsiteUrl(userForm.value.website.trim()) : null,
    country: userForm.value.country.trim() ? userForm.value.country.trim().toUpperCase() : null,
    birthday: userForm.value.birthday.trim() ? userForm.value.birthday.trim() : null,
    public: userForm.value.public,
    supporter_patreon: userForm.value.supporter_patreon,
    supporter_lifetime: userForm.value.supporter_lifetime,
    patreon_id: userForm.value.patreon_id.trim() || null,
    discord_id: userForm.value.discord_id.trim() || null,
    steam_id: userForm.value.steam_id.trim() || null,
    badges: dedupeBadges(userForm.value.badges),
    // Only include role if user has permission to modify roles
    ...(canEditRoles.value && { role: selectedRole.value }),
  }

  emit('save', userData)
}

// Open confirmation modal for deletion
function handleDelete() {
  if (!props.user)
    return

  showDeleteConfirm.value = true
}

// Perform actual deletion when confirmed
function confirmDelete() {
  if (!props.user)
    return

  if (deleteLoading.value)
    return

  deleteLoading.value = true
  emit('delete', props.user.id)
}

// Handle avatar deletion
async function handleAvatarDelete() {
  if (!props.user?.id)
    return

  avatarDeleting.value = true

  try {
    await deleteUserAvatar(supabase, props.user.id)
    avatarUrl.value = null
    // You might want to emit an event here to notify parent component
  }
  catch (error) {
    console.error('Error deleting avatar:', error)
    // Handle error state if needed
  }
  finally {
    avatarDeleting.value = false
  }
}

// Character counts for text areas
const markdownCharCount = computed(() => userForm.value.markdown.length)

type CountrySelectOption = (typeof COUNTRY_SELECT_OPTIONS)[number]

const countrySelectModel = computed<CountrySelectOption[] | undefined>({
  get() {
    if (!userForm.value.country)
      return undefined

    const match = COUNTRY_SELECT_OPTIONS.find(option => option.value === userForm.value.country)
    return match ? [match] : undefined
  },
  set(value) {
    const selection = value?.[0]
    userForm.value.country = selection?.value ?? ''
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
    return parseDateOnly(userForm.value.birthday)
  },
  set(value) {
    userForm.value.birthday = value ? formatDateOnly(value) : ''
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

const hasBirthday = computed(() => !!userForm.value.birthday)

function clearBirthday() {
  userForm.value.birthday = ''
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ props.isEditMode ? 'Edit User' : 'Add User' }}</h4>
        <p v-if="props.isEditMode && props.user" class="text-color-light text-xs">
          {{ props.user.username }}
        </p>
      </Flex>
    </template>

    <!-- User Info Section -->
    <Flex column gap="l" class="user-form" expand>
      <!-- Admin Guidelines -->
      <Flex v-if="props.isEditMode" column gap="s" class="admin-guidelines" expand>
        <h5>⚠️ Admin Guidelines</h5>
        <ul class="guidelines-list text-s">
          <li>
            <Icon name="ph:warning-circle" />
            Only modify user information for content moderation purposes
          </li>
          <li>
            <Icon name="ph:warning-circle" />
            Personal information should remain unchanged unless necessary for safety
          </li>
          <li>
            <Icon name="ph:warning-circle" />
            All modifications are logged and subject to audit
          </li>
        </ul>
      </Flex>

      <Flex column gap="m" expand>
        <h4>User Information</h4>

        <Flex gap="m">
          <Switch
            v-model="userForm.public"
            label="Public profile"
            description="Allow anyone to view this user's profile page"
            :disabled="!canEditForm"
          />
        </Flex>

        <Input
          v-model="userForm.username"
          expand
          label="Username"
          hint="Username can only contain Latin letters, numbers, and underscores"
          placeholder="Enter username"
          :limit="USERNAME_LIMIT"
          :disabled="!canEditForm"
          :errors="usernameValidation.error ? [usernameValidation.error] : undefined"
        />

        <!-- Role Management Section -->
        <Flex column gap="m" expand>
          <div v-if="rolesLoading" class="roles-loading">
            <Icon name="ph:spinner" spin />
          </div>

          <div v-else-if="rolesError" class="help-text error">
            <Icon name="ph:warning" />
            {{ rolesError }}
          </div>

          <Flex v-else class="roles-section" column expand>
            <Flex class="role-dropdown" expand y-center :gap="0">
              <Select
                v-model="selectedRoleComputed"
                label="User Role"
                placeholder="Select role"
                :options="roleSelectOptions"
                :disabled="!canEditRoles"
                expand
              />
            </Flex>
            <Flex v-if="!canEditRoles" class="help-text help-text-input">
              <Icon name="ph:lock" />
              <span v-if="currentUser && props.user && currentUser.id === props.user.id">
                You cannot modify your own role
              </span>
              <span v-else-if="!canUpdateRoles">
                Requires 'roles.update' permission to modify user roles
              </span>
              <span v-else-if="!permissionVerified">
                <span v-if="permissionVerifying">Verifying permissions...</span>
                <span v-else>Role modification permissions not verified</span>
              </span>
              <span v-else>
                Role modification not permitted
              </span>
            </Flex>
          </Flex>
        </Flex>

        <Flex expand gap="m">
          <Textarea
            v-model="userForm.introduction"
            expand
            label="Introduction"
            placeholder="Short introduction about the user"
            :rows="3"
            :limit="INTRODUCTION_LIMIT"
            :disabled="!canEditForm"
            :errors="introductionValidation.error ? [introductionValidation.error] : undefined"
          />

          <Flex column gap="xs">
            <label class="text-m">Avatar</label>
            <!-- Avatar Management (Edit Mode Only) -->
            <AvatarDelete
              v-if="props.isEditMode && props.user"
              :size="98"
              :user-id="props.user.id"
              :username="props.user.username"
              :avatar-url="avatarUrl"
              :loading="avatarDeleting"
              :disabled="!canEditForm"
              @delete="handleAvatarDelete"
            />
          </Flex>
        </Flex>

        <Input
          v-model="userForm.website"
          expand
          label="Website"
          placeholder="https://example.com"
          :valid="websiteValidation.valid"
          :error="websiteValidation.error"
          :disabled="!canEditForm"
        >
          <template #after>
            <div class="help-text">
              <Icon name="ph:info" />
              Personal website or portfolio URL
            </div>
          </template>
        </Input>

        <Flex column gap="xs" expand>
          <label class="text-m">Birthday</label>
          <Flex gap="xs" y-center expand>
            <Calendar
              v-model="birthdayDateModel"
              expand
              format="yyyy-MM-dd"
              :class="{ invalid: !birthdayValidation.valid && hasBirthday }"
            >
              <template #trigger>
                <Button
                  class="user-form__date-picker-button"
                  expand
                  :class="{ error: !birthdayValidation.valid && hasBirthday }"
                  :disabled="!canEditForm"
                >
                  {{ birthdayButtonLabel }}
                  <template #end>
                    <Icon name="ph:calendar" />
                  </template>
                </Button>
              </template>
            </Calendar>
            <Tooltip v-if="hasBirthday">
              <Button
                variant="link"
                square
                :disabled="!canEditForm"
                @click="clearBirthday"
              >
                <Icon name="ph:x" />
              </Button>
              <template #tooltip>
                <p>Clear birthday</p>
              </template>
            </Tooltip>
          </Flex>
          <span v-if="!birthdayValidation.valid && hasBirthday" class="text-xs text-color-red">
            {{ birthdayValidation.error }}
          </span>
        </Flex>

        <Select
          v-model="countrySelectModel"
          expand
          label="Country"
          placeholder="Select country (optional)"
          single
          search
          show-clear
          :options="COUNTRY_SELECT_OPTIONS"
          :errors="countryValidation.valid ? undefined : [countryValidation.error ?? 'Please select a valid country']"
          :disabled="!canEditForm"
        />

        <RichTextEditor
          v-model="userForm.markdown"
          label="Profile Content (Markdown)"
          hint="You can use markdown"
          placeholder="Detailed profile content in markdown format"
          min-height="216px"
          show-expand-button
          :disabled="!canEditForm"
          :errors="markdownValidation.valid ? [] : [markdownValidation.error ?? 'Invalid markdown content']"
          :media-context="props.user?.id ? `${props.user.id}/markdown/media` : undefined"
          :media-bucket-id="USERS_BUCKET_ID"
          :show-attachment-button="!!props.user?.id"
        />
        <Flex x-between class="help-text">
          <div>
            <Icon name="ph:info" />
            You can use Markdown formatting. HTML tags are not allowed.
          </div>
          <div class="character-count">
            <span :class="{ 'over-limit': markdownCharCount > MARKDOWN_LIMIT }">
              {{ markdownCharCount }}/{{ MARKDOWN_LIMIT }}
            </span>
          </div>
        </Flex>
      </Flex>

      <!-- External IDs Section -->
      <Flex column gap="m" expand>
        <h4>External IDs</h4>

        <Input
          v-model="userForm.patreon_id"
          expand
          label="Patreon ID"
          hint="Numeric ID from Patreon user profile (optional)"
          placeholder="Enter Patreon ID"
          :errors="patreonIdValidation.error ? [patreonIdValidation.error] : undefined"
          :disabled="!canEditForm"
        />

        <Input
          v-model="userForm.discord_id"
          expand
          label="Discord ID"
          hint="Discord user ID (17-19 digits, optional)"
          placeholder="Enter Discord ID"
          :errors="discordIdValidation.error ? [discordIdValidation.error] : undefined"
          :disabled="!canEditForm"
        />

        <Input
          v-model="userForm.steam_id"
          expand
          label="Steam ID"
          hint="Steam ID64 format (17 digits, optional)"
          placeholder="Enter Steam ID"
          :errors="steamIdValidation.error ? [steamIdValidation.error] : undefined"
          :disabled="!canEditForm"
        />
      </Flex>

      <!-- Supporter Status Section -->
      <Flex column gap="m" expand>
        <h4>Supporter Status</h4>

        <Flex gap="m">
          <Switch
            v-model="userForm.supporter_patreon"
            label="Patreon Supporter"
            description="User is currently a Patreon supporter"
            :disabled="!canEditForm"
          />

          <Switch
            v-model="userForm.supporter_lifetime"
            label="Lifetime Supporter"
            description="User has lifetime supporter status"
            :disabled="!canEditForm"
          />
        </Flex>

        <h4>Badges</h4>
        <Flex column gap="xs">
          <div class="badge-grid">
            <Tooltip
              v-for="badge in BADGE_VALUES"
              :key="badge"
            >
              <div
                class="badge-toggle" :class="[{ 'badge-inactive': !isBadgeActive(badge),
                                                'badge-toggle--disabled': !canEditForm }]"
                :role="canEditForm ? 'button' : undefined"
                :aria-pressed="isBadgeActive(badge)"
                @click="canEditForm && toggleBadge(badge)"
              >
                <component :is="BADGE_COMPONENTS[badge]" compact />
              </div>
              <template #tooltip>
                <p>{{ BADGE_DESCRIPTIONS[badge] }}</p>
              </template>
            </Tooltip>
          </div>
          <div class="help-text">
            <Icon name="ph:info" />
            {{ badgeSummaryText }}
          </div>
        </Flex>
      </Flex>
    </Flex>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          variant="accent"
          :disabled="!isValid || !canEditForm"
          @click="handleSubmit"
        >
          <template #start>
            <Icon name="mdi:content-save" />
          </template>
          {{ props.isEditMode ? 'Save Changes' : 'Create User' }}
        </Button>

        <Button @click="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Tooltip v-if="showDeleteButton">
          <Button
            variant="danger"
            square
            :loading="deleteLoading"
            @click="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete user</p>
          </template>
        </Tooltip>
      </Flex>
    </template>
  </Sheet>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteConfirm"
    :confirm="confirmDelete"
    title="Delete User"
    :description="`Are you sure you want to delete the user '${props.user?.username}'? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped lang="scss">
.user-form {
  padding-bottom: var(--space);

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

.form-actions {
  margin-top: var(--space);

  .flex-1 {
    flex: 1;
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

.admin-guidelines {
  background: var(--color-bg-subtle);
  padding: var(--space-m);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);

  .guidelines-list {
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
        font-size: var(--font-size-m);

        &[name='ph:warning-circle'] {
          color: var(--color-text-yellow);
        }

        &[name='ph:check-circle'] {
          color: var(--color-text-green);
        }
      }
    }
  }
}

.badge-grid-label {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  font-weight: var(--font-weight-medium);
}

.badge-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-s);
}

.badge-toggle {
  display: flex;
  justify-content: center;
  cursor: pointer;
  border-radius: var(--border-radius-m);
  transition:
    filter var(--transition),
    opacity var(--transition);

  &:hover:not(.badge-toggle--disabled) {
    filter: brightness(1.15);
  }

  &--disabled {
    cursor: default;
  }

  &.badge-inactive {
    filter: grayscale(1);
    opacity: 0.35;

    &:hover:not(.badge-toggle--disabled) {
      filter: grayscale(0.5);
      opacity: 0.6;
    }
  }
}

.roles-section {
  .roles-loading {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-m);
    color: var(--color-text-light);
  }

  .role-dropdown {
    margin-top: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);

    .role-description {
      font-size: var(--font-size-s);
      color: var(--color-text-light);
      font-style: italic;
    }
  }
}
</style>
