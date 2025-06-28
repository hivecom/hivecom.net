<script setup lang="ts">
import { Button, Flex, Input, Select, Sheet, Switch, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import AvatarDelete from '@/components/Shared/AvatarDelete.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { stripHtmlTags, validateMarkdownNoHtml } from '~/utils/sanitize'
import { deleteUserAvatar, getUserAvatarUrl } from '~/utils/storage'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  user: {
    id: string
    username: string
    created_at: string
    modified_at: string | null
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
  } | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get current user and admin permissions
const currentUser = useSupabaseUser()
const { canModifyUsers, canDeleteUsers, canUpdateRoles } = useAdminPermissions()

// Supabase client for role operations
const supabase = useSupabaseClient()

// Avatar state
const avatarUrl = ref<string | null>(null)
const avatarDeleting = ref(false)

// Available roles - "User" means no role in database
const availableRoles = [
  { value: 'user', label: 'User', description: 'Standard user with no admin privileges' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access' },
  { value: 'moderator', label: 'Moderator', description: 'Content moderation privileges' },
] as const

// Convert roles to Select component options format
const roleSelectOptions = computed(() =>
  availableRoles.map(role => ({
    label: role.label,
    value: role.value,
  })),
)

// Form state
const userForm = ref({
  username: '',
  introduction: '',
  markdown: '',
  website: '',
  supporter_patreon: false,
  supporter_lifetime: false,
  patreon_id: '',
  discord_id: '',
  steam_id: '',
})

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
    selectedRole.value = (value && value.length > 0) ? value[0].value : 'user'
  },
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Limits (matching database constraints)
const USERNAME_LIMIT = 32
const INTRODUCTION_LIMIT = 128
const MARKDOWN_LIMIT = 8128

// Username validation rules based on database constraints
const usernameValidation = computed(() => {
  const username = userForm.value.username.trim()

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

// External ID validation functions
const patreonIdValidation = computed(() => {
  const id = userForm.value.patreon_id.trim()
  if (!id)
    return { valid: true, error: null }

  if (!/^\d+$/.test(id)) {
    return { valid: false, error: 'Patreon ID must be numeric' }
  }

  return { valid: true, error: null }
})

const discordIdValidation = computed(() => {
  const id = userForm.value.discord_id.trim()
  if (!id)
    return { valid: true, error: null }

  if (!/^\d{17,19}$/.test(id)) {
    return { valid: false, error: 'Discord ID must be 17-19 digits' }
  }

  return { valid: true, error: null }
})

const steamIdValidation = computed(() => {
  const id = userForm.value.steam_id.trim()
  if (!id)
    return { valid: true, error: null }

  if (!/^\d{17}$/.test(id)) {
    return { valid: false, error: 'Steam ID must be 17 digits' }
  }

  return { valid: true, error: null }
})

// Markdown validation
const markdownValidation = computed(() => {
  const markdown = userForm.value.markdown.trim()

  if (markdown.length > MARKDOWN_LIMIT) {
    return { valid: false, error: `Content must be ${MARKDOWN_LIMIT} characters or less` }
  }

  return validateMarkdownNoHtml(markdown)
})

// Introduction validation
const introductionValidation = computed(() => {
  const introduction = userForm.value.introduction.trim()

  if (introduction.length > INTRODUCTION_LIMIT) {
    return { valid: false, error: `Introduction must be ${INTRODUCTION_LIMIT} characters or less` }
  }

  return validateMarkdownNoHtml(introduction)
})

// Website validation
const websiteValidation = computed(() => {
  const website = userForm.value.website.trim()

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
  patreon_id: patreonIdValidation.value.valid,
  discord_id: discordIdValidation.value.valid,
  steam_id: steamIdValidation.value.valid,
  markdown: markdownValidation.value.valid,
  introduction: introductionValidation.value.valid,
  website: websiteValidation.value.valid,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

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
  if (currentUser.value && props.user && currentUser.value.id === props.user.id) {
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
      .eq('user_id', currentUser.value.id)
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
      userForm.value = {
        username: newUser.username,
        introduction: newUser.introduction || '',
        markdown: newUser.markdown || '',
        website: (newUser as typeof newUser & { website?: string }).website || '',
        supporter_patreon: newUser.supporter_patreon,
        supporter_lifetime: newUser.supporter_lifetime,
        patreon_id: newUser.patreon_id || '',
        discord_id: newUser.discord_id || '',
        steam_id: newUser.steam_id || '',
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
      userForm.value = {
        username: '',
        introduction: '',
        markdown: '',
        website: '',
        supporter_patreon: false,
        supporter_lifetime: false,
        patreon_id: '',
        discord_id: '',
        steam_id: '',
      }
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
    supporter_patreon: userForm.value.supporter_patreon,
    supporter_lifetime: userForm.value.supporter_lifetime,
    patreon_id: userForm.value.patreon_id.trim() || null,
    discord_id: userForm.value.discord_id.trim() || null,
    steam_id: userForm.value.steam_id.trim() || null,
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
const introductionCharCount = computed(() => userForm.value.introduction.length)
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
        <h4>{{ props.isEditMode ? 'Edit User' : 'Add User' }}</h4>
        <span v-if="props.isEditMode && props.user" class="color-text-light text-xxs">
          {{ props.user.username }}
        </span>
      </Flex>
    </template>

    <!-- User Info Section -->
    <Flex column gap="l" class="user-form" expand>
      <!-- Admin Guidelines -->
      <Flex v-if="props.isEditMode" column gap="s" class="admin-guidelines" expand>
        <h5>⚠️ Admin Guidelines</h5>
        <ul class="guidelines-list">
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

        <Input
          v-model="userForm.username"
          expand
          label="Username"
          placeholder="Enter username"
          :valid="usernameValidation.valid"
          :error="usernameValidation.error"
          :maxlength="USERNAME_LIMIT"
          :disabled="!canEditForm"
        >
          <template #after>
            <Flex expand x-between>
              <div v-if="!usernameValidation.valid && userForm.username" class="help-text error">
                <Icon name="ph:warning" />
                {{ usernameValidation.error }}
              </div>
              <div v-else class="help-text">
                <Icon name="ph:info" />
                Username can only contain letters, numbers, and underscores
              </div>
              <div class="character-count">
                <span :class="{ 'over-limit': userForm.username.length > USERNAME_LIMIT }">
                  {{ userForm.username.length }}/{{ USERNAME_LIMIT }}
                </span>
              </div>
            </Flex>
          </template>
        </Input>

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
            <Flex class="role-dropdown" expand y-end>
              <Select
                v-model="selectedRoleComputed"
                label="User Role"
                placeholder="Select role"
                :options="roleSelectOptions"
                :disabled="!canEditRoles"
                expand
              />
              <Flex v-if="!canEditRoles" class="help-text">
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
        </Flex>

        <Flex expand gap="m">
          <Textarea
            v-model="userForm.introduction"
            expand
            label="Introduction"
            placeholder="Short introduction about the user"
            :rows="3"
            :maxlength="INTRODUCTION_LIMIT"
            :disabled="!canEditForm"
            :valid="introductionValidation.valid"
            :error="introductionValidation.error"
          >
            <template #after>
              <Flex x-between>
                <div class="help-text">
                  <Icon name="ph:info" />
                  HTML tags are not allowed
                </div>
                <div class="character-count">
                  <span :class="{ 'over-limit': introductionCharCount > INTRODUCTION_LIMIT }">
                    {{ introductionCharCount }}/{{ INTRODUCTION_LIMIT }}
                  </span>
                </div>
              </Flex>
            </template>
          </Textarea>
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

        <Textarea
          v-model="userForm.markdown"
          expand
          label="Profile Content (Markdown)"
          placeholder="Detailed profile content in markdown format"
          :rows="8"
          :maxlength="MARKDOWN_LIMIT"
          :disabled="!canEditForm"
          :valid="markdownValidation.valid"
          :error="markdownValidation.error"
        >
          <template #after>
            <Flex x-between>
              <div class="help-text">
                <Icon name="ph:info" />
                You can use Markdown formatting. HTML tags are not allowed.
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

      <!-- External IDs Section -->
      <Flex column gap="m" expand>
        <h4>External IDs</h4>

        <Input
          v-model="userForm.patreon_id"
          expand
          label="Patreon ID"
          placeholder="Enter Patreon ID"
          :valid="patreonIdValidation.valid"
          :error="patreonIdValidation.error"
          :disabled="!canEditForm"
        >
          <template #after>
            <div v-if="!patreonIdValidation.valid && userForm.patreon_id" class="help-text error">
              <Icon name="ph:warning" />
              {{ patreonIdValidation.error }}
            </div>
            <div v-else class="help-text">
              <Icon name="ph:info" />
              Numeric ID from Patreon user profile (optional)
            </div>
          </template>
        </Input>

        <Input
          v-model="userForm.discord_id"
          expand
          label="Discord ID"
          placeholder="Enter Discord ID"
          :valid="discordIdValidation.valid"
          :error="discordIdValidation.error"
          :disabled="!canEditForm"
        >
          <template #after>
            <div v-if="!discordIdValidation.valid && userForm.discord_id" class="help-text error">
              <Icon name="ph:warning" />
              {{ discordIdValidation.error }}
            </div>
            <div v-else class="help-text">
              <Icon name="ph:info" />
              Discord user ID (17-19 digits, optional)
            </div>
          </template>
        </Input>

        <Input
          v-model="userForm.steam_id"
          expand
          label="Steam ID"
          placeholder="Enter Steam ID"
          :valid="steamIdValidation.valid"
          :error="steamIdValidation.error"
          :disabled="!canEditForm"
        >
          <template #after>
            <div v-if="!steamIdValidation.valid && userForm.steam_id" class="help-text error">
              <Icon name="ph:warning" />
              {{ steamIdValidation.error }}
            </div>
            <div v-else class="help-text">
              <Icon name="ph:info" />
              Steam ID64 format (17 digits, optional)
            </div>
          </template>
        </Input>
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

        <Button
          v-if="showDeleteButton"
          variant="danger"
          square
          data-title-left="Delete user"
          @click="handleDelete"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>
  </Sheet>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteConfirm"
    v-model:confirm="confirmDelete"
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
