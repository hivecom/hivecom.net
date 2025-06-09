<script setup lang="ts">
import { Button, Flex, Input, Sheet, Switch, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '../../Shared/ConfirmModal.vue'
import RoleIndicator from '../../Shared/RoleIndicator.vue'

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

// Supabase client for role operations
const supabase = useSupabaseClient()

// Available roles from the app_role enum
const availableRoles = ['admin', 'moderator'] as const

// Form state
const userForm = ref({
  username: '',
  introduction: '',
  markdown: '',
  supporter_patreon: false,
  supporter_lifetime: false,
  patreon_id: '',
  discord_id: '',
  steam_id: '',
})

// Role management state
const userRoles = ref<string[]>([])
const originalRoles = ref<string[]>([])
const rolesLoading = ref(false)
const rolesError = ref('')

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

// Form validation
const validation = computed(() => ({
  username: usernameValidation.value.valid,
  patreon_id: patreonIdValidation.value.valid,
  discord_id: discordIdValidation.value.valid,
  steam_id: steamIdValidation.value.valid,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

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

    const roles = data?.map(item => item.role) || []
    userRoles.value = [...roles]
    originalRoles.value = [...roles]
  }
  catch (error) {
    console.error('Error fetching user roles:', error)
    rolesError.value = 'Failed to load user roles'
  }
  finally {
    rolesLoading.value = false
  }
}

// Toggle role selection
function toggleRole(role: string) {
  const index = userRoles.value.indexOf(role)
  if (index > -1) {
    userRoles.value.splice(index, 1)
  }
  else {
    userRoles.value.push(role)
  }
}

// Check if role is selected
function isRoleSelected(role: string) {
  return userRoles.value.includes(role)
}

// Check if roles have changed
const rolesChanged = computed(() => {
  if (userRoles.value.length !== originalRoles.value.length)
    return true
  return userRoles.value.some(role => !originalRoles.value.includes(role))
    || originalRoles.value.some(role => !userRoles.value.includes(role))
})

// Update form data when user prop changes
watch(
  () => props.user,
  (newUser) => {
    if (newUser) {
      userForm.value = {
        username: newUser.username,
        introduction: newUser.introduction || '',
        markdown: newUser.markdown || '',
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
    }
    else {
      // Reset form for new user
      userForm.value = {
        username: '',
        introduction: '',
        markdown: '',
        supporter_patreon: false,
        supporter_lifetime: false,
        patreon_id: '',
        discord_id: '',
        steam_id: '',
      }
      // Reset roles for new user
      userRoles.value = []
      originalRoles.value = []
    }
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

  // Prepare the data to save
  const userData = {
    username: userForm.value.username.trim(),
    introduction: userForm.value.introduction.trim() || null,
    markdown: userForm.value.markdown.trim() || null,
    supporter_patreon: userForm.value.supporter_patreon,
    supporter_lifetime: userForm.value.supporter_lifetime,
    patreon_id: userForm.value.patreon_id.trim() || null,
    discord_id: userForm.value.discord_id.trim() || null,
    steam_id: userForm.value.steam_id.trim() || null,
    roles: userRoles.value,
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
      <h4>{{ props.isEditMode ? 'Edit User' : 'Add User' }}</h4>
    </template>

    <!-- User Info Section -->
    <Flex column gap="l" class="user-form" expand>
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

        <Textarea
          v-model="userForm.introduction"
          expand
          label="Introduction"
          placeholder="Short introduction about the user"
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
        </Textarea>

        <Textarea
          v-model="userForm.markdown"
          expand
          label="Profile Description (Markdown)"
          placeholder="Detailed profile description in markdown format"
          :rows="8"
          :maxlength="MARKDOWN_LIMIT"
        >
          <template #after>
              <div class="character-count">
                <span :class="{ 'over-limit': markdownCharCount > MARKDOWN_LIMIT }">
                  {{ markdownCharCount }}/{{ MARKDOWN_LIMIT }}
                </span>
              </div>
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
          />

          <Switch
            v-model="userForm.supporter_lifetime"
            label="Lifetime Supporter"
            description="User has lifetime supporter status"
          />
        </Flex>
      </Flex>

      <!-- Role Management Section -->
      <Flex column gap="m" expand>
        <h4>Role Management</h4>

        <div v-if="rolesLoading" class="roles-loading">
          <Icon name="ph:spinner" spin />
          Loading roles...
        </div>

        <div v-else-if="rolesError" class="help-text error">
          <Icon name="ph:warning" />
          {{ rolesError }}
        </div>

        <div v-else class="roles-section">
          <div class="help-text">
            <Icon name="ph:info" />
            Select roles for this user. Users need at least one role to access admin features.
          </div>

          <Flex wrap gap="s" class="role-buttons">
            <Button
              v-for="role in availableRoles"
              :key="role"
              :variant="isRoleSelected(role) ? 'accent' : undefined"
              :outline="!isRoleSelected(role)"
              size="s"
              @click="toggleRole(role)"
            >
              <template #start>
                <Icon :name="isRoleSelected(role) ? 'ph:check-circle' : 'ph:circle'" />
              </template>
              {{ role.charAt(0).toUpperCase() + role.slice(1) }}
            </Button>
          </Flex>

          <div v-if="userRoles.length > 0" class="selected-roles">
            <span class="roles-label">Selected roles:</span>
            <Flex gap="xs" wrap>
              <RoleIndicator
                v-for="role in userRoles"
                :key="role"
                :role="role"
                size="s"
              />
            </Flex>
          </div>

          <div v-if="rolesChanged" class="help-text" style="color: var(--color-text-orange);">
            <Icon name="ph:warning-circle" />
            Role changes will be saved when you submit the form
          </div>
        </div>
      </Flex>

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
    </Flex>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          variant="accent"
          :disabled="!isValid"
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
          v-if="props.isEditMode"
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
    font-weight: 600;
  }

  h5 {
    margin: 0 0 var(--space-xs) 0;
    color: var(--color-text);
    font-size: var(--font-size-m);
    font-weight: 600;
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
    font-weight: 600;
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

  .role-buttons {
    margin-top: var(--space-s);
  }

  .selected-roles {
    margin-top: var(--space-s);
    padding: var(--space-s);
    background: var(--color-bg-subtle);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);

    .roles-label {
      display: block;
      margin-bottom: var(--space-xs);
      font-size: var(--font-size-s);
      font-weight: 600;
      color: var(--color-text);
    }
  }
}
</style>
