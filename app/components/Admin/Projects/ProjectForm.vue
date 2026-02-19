<script setup lang="ts">
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import { Badge, Button, Flex, Input, Select, Sheet, Textarea } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import { deleteProjectBanner, getProjectBannerUrl, uploadProjectBanner } from '@/lib/storage'

// Interface for project query result
interface QueryProject {
  created_at: string
  created_by: string
  description: string | null
  id: number
  link: string | null
  markdown: string
  modified_at: string | null
  modified_by: string | null
  owner: string | null
  tags: string[] | null
  title: string
  github: string | null
}

// Interface for profile selection
interface ProfileSelect {
  id: string
  username: string
}

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  project: QueryProject | null
  isEditMode: boolean
}>()

const emit = defineEmits<{
  (e: 'save', project: TablesInsert<'projects'> | TablesUpdate<'projects'>): void
  (e: 'delete', projectId: number): void
}>()

const isOpen = defineModel<boolean>('open', { default: false })
const supabase = useSupabaseClient()
// Form state
const projectForm = ref({
  title: '',
  description: '',
  markdown: '',
  link: '',
  owner: null as string | null, // UUID of the owner
  tags: [] as string[],
  github: '',
})

const bannerUrl = ref<string | null>(null)
const bannerUploading = ref(false)
const bannerDeleting = ref(false)
const bannerError = ref<string | null>(null)
const canManageBanner = computed(() => !!props.project)

// New tag input for adding individual tags
const newTagInput = ref('')

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Loading states for dropdowns
const loadingProfiles = ref(true)

// Options for dropdowns
const profiles = ref<ProfileSelect[]>([])

// Computed options for selects
const profileOptions = computed(() =>
  profiles.value.map(profile => ({
    label: profile.username || 'Unknown User',
    value: profile.id,
  })),
)

// Computed property to handle conversion between form values and select options
const selectedOwnerComputed = computed({
  get: () => {
    if (!projectForm.value.owner)
      return []
    const option = profileOptions.value.find(opt => opt.value === projectForm.value.owner)
    return option ? [option] : []
  },
  set: (value: SelectOption[] | null | undefined) => {
    projectForm.value.owner = (value && value.length > 0 && value[0]) ? value[0].value : null
  },
})

// GitHub repository format validation (username/repository)
const githubRegex = /^\w[\w.-]*\/\w[\w.-]*$/

// Form validation
const validation = computed(() => ({
  title: !!projectForm.value.title.trim(),
  markdown: !!projectForm.value.markdown.trim(),
  github: !projectForm.value.github.trim() || githubRegex.test(projectForm.value.github.trim()),
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Fetch dropdown data
async function fetchDropdownData() {
  try {
    // Fetch profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .order('username')

    if (profilesError)
      throw profilesError
    profiles.value = profilesData || []
    loadingProfiles.value = false
  }
  catch (error) {
    console.error('Error fetching dropdown data:', error)
  }
}

// Update form data when project prop changes
watch(
  () => props.project,
  (newProject) => {
    if (newProject) {
      projectForm.value = {
        title: newProject.title || '',
        description: newProject.description || '',
        markdown: newProject.markdown || '',
        link: newProject.link || '',
        owner: newProject.owner || null,
        tags: newProject.tags || [],
        github: newProject.github || '',
      }
      void refreshBannerPreview(newProject.id)
    }
    else {
      projectForm.value = {
        title: '',
        description: '',
        markdown: '',
        link: '',
        owner: null,
        tags: [],
        github: '',
      }
      bannerUrl.value = null
      bannerError.value = null
    }
  },
  { immediate: true },
)

async function refreshBannerPreview(projectId: number | null | undefined) {
  if (!projectId) {
    bannerUrl.value = null
    return
  }

  try {
    bannerError.value = null
    bannerUrl.value = await getProjectBannerUrl(supabase, projectId)
  }
  catch (error) {
    console.error('Error loading project banner:', error)
    bannerUrl.value = null
  }
}

async function handleBannerUpload(file: File) {
  if (!props.project) {
    bannerError.value = 'Save the project before uploading a banner.'
    return
  }

  try {
    bannerUploading.value = true
    bannerError.value = null
    await uploadProjectBanner(supabase, props.project.id, file)
    await refreshBannerPreview(props.project.id)
  }
  catch (error) {
    console.error('Error uploading project banner:', error)
    bannerError.value = 'Failed to upload banner. Please try again.'
  }
  finally {
    bannerUploading.value = false
  }
}

async function handleBannerDelete() {
  if (!props.project)
    return

  try {
    bannerDeleting.value = true
    bannerError.value = null
    await deleteProjectBanner(supabase, props.project.id)
    bannerUrl.value = null
  }
  catch (error) {
    console.error('Error deleting project banner:', error)
    bannerError.value = 'Failed to delete banner. Please try again.'
  }
  finally {
    bannerDeleting.value = false
  }
}

function handleBannerInvalid(message: string) {
  bannerError.value = message
}

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  // Prepare the data to save
  const projectData: TablesInsert<'projects'> | TablesUpdate<'projects'> = {
    title: projectForm.value.title,
    description: projectForm.value.description || null,
    markdown: projectForm.value.markdown,
    link: projectForm.value.link || null,
    owner: projectForm.value.owner || null,
    tags: projectForm.value.tags.length > 0 ? projectForm.value.tags : null,
    github: projectForm.value.github.trim() || null,
  }

  emit('save', projectData)
}

// Handle delete
function handleDelete() {
  if (!props.project)
    return
  showDeleteConfirm.value = true
}

// Confirm delete
function confirmDelete() {
  if (!props.project)
    return
  emit('delete', props.project.id)
}

// Fetch dropdown data when component mounts
onMounted(fetchDropdownData)

// Add a new tag
function addTag() {
  const rawTag = newTagInput.value.trim()
  if (rawTag) {
    // Normalize tag: lowercase and replace spaces with hyphens
    const normalizedTag = rawTag.toLowerCase().replace(/\s+/g, '-')
    if (!projectForm.value.tags.includes(normalizedTag)) {
      projectForm.value.tags.push(normalizedTag)
      newTagInput.value = ''
    }
  }
}

// Remove a tag
function removeTag(tagToRemove: string) {
  projectForm.value.tags = projectForm.value.tags.filter(tag => tag !== tagToRemove)
}

// Handle enter key in new tag input
function handleTagInputEnter() {
  addTag()
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
        <h4>{{ props.isEditMode ? 'Edit Project' : 'Add Project' }}</h4>
        <p v-if="props.isEditMode && props.project" class="text-color-light text-xs">
          {{ props.project.title }}
        </p>
      </Flex>
    </template>

    <!-- Project Form Section -->
    <Flex column gap="l" class="project-form">
      <!-- Basic Information -->
      <Flex column gap="m" expand>
        <h4>Basic Information</h4>

        <Input
          v-model="projectForm.title"
          expand
          name="title"
          label="Title"
          required
          :valid="validation.title"
          error="Project title is required"
          placeholder="Enter project title"
        />

        <Textarea
          v-model="projectForm.description"
          expand
          name="description"
          label="Description"
          placeholder="Enter project description (optional)"
          :rows="3"
        />

        <Flex expand column gap="s">
          <label class="input-label">Banner Image</label>
          <FileUpload
            label="Upload banner"
            :preview-url="bannerUrl"
            :loading="bannerUploading"
            :deleting="bannerDeleting"
            :error="bannerError"
            :disabled="!canManageBanner"
            :show-delete="!!bannerUrl && canManageBanner"
            :aspect-ratio="16 / 5"
            @upload="handleBannerUpload"
            @delete="handleBannerDelete"
            @invalid="handleBannerInvalid"
          />
          <p v-if="!canManageBanner" class="banner-upload__notice">
            Save the project before uploading a banner.
          </p>
        </Flex>

        <Input
          v-model="projectForm.link"
          expand
          name="link"
          label="Link"
          placeholder="Enter external link (optional)"
        />

        <Select
          v-model="selectedOwnerComputed"
          search
          expand
          name="owner"
          label="Owner"
          placeholder="Select owner"
          :options="profileOptions"
          :loading="loadingProfiles"
          searchable
          show-clear
        />

        <div class="tags-section">
          <label class="input-label">Tags</label>

          <!-- Add new tag -->
          <Flex gap="xs" y-center>
            <Input
              v-model="newTagInput"
              expand
              name="new-tag"
              placeholder="Enter a tag"
              @keydown.enter.prevent="handleTagInputEnter"
            />
            <Button
              variant="accent"
              square
              :disabled="!newTagInput.trim()"
              @click="addTag"
            >
              <Icon name="ph:plus" />
            </Button>
          </Flex>

          <!-- Display existing tags -->
          <div v-if="projectForm.tags.length > 0" class="tags-display">
            <Badge
              v-for="tag in projectForm.tags"
              :key="tag"
              size="s"
              variant="neutral"
              class="tag-badge"
            >
              {{ tag }}
              <Button
                size="s"
                square
                class="tag-remove-btn"
                @click="removeTag(tag)"
              >
                <Icon name="ph:x" />
              </Button>
            </Badge>
          </div>
        </div>

        <!-- GitHub Repository -->
        <Input
          v-model="projectForm.github"
          expand
          name="github"
          label="GitHub Repository"
          placeholder="username/repository (optional)"
          :valid="validation.github"
          error="Invalid format. Use 'username/repository' format"
        />
      </Flex>

      <!-- Content Section -->
      <Flex column gap="m" expand>
        <h4>Content</h4>

        <Textarea
          v-model="projectForm.markdown"
          expand
          name="markdown"
          label="Markdown Content"
          required
          :valid="validation.markdown"
          error="Markdown content is required"
          placeholder="Enter markdown content"
          :rows="12"
        />
      </Flex>
    </Flex>

    <!-- Form Actions -->
    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid"
          @click.prevent="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ props.isEditMode ? 'Update' : 'Create' }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Button
          v-if="props.isEditMode"
          variant="danger"
          square
          data-title-left="Delete project"
          @click.prevent="handleDelete"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>

    <!-- Confirmation Modal for Delete Action -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
      title="Confirm Delete Project"
      :description="`Are you sure you want to delete the project '${props.project?.title}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.project-form {
  padding-bottom: var(--space);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}

.required {
  color: var(--color-danger);
}

.input-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
}

.banner-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.banner-upload__notice {
  font-size: var(--font-size-xs);
  color: var(--color-text-subtle);
  margin-top: var(--space-xs);
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .tags-display {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }

  .tag-badge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    position: relative;

    .tag-remove-btn {
      margin-left: var(--space-xs);
      padding: 2px;
      min-width: auto;
      min-height: auto;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.2);
      color: currentColor;

      &:hover {
        background: rgba(0, 0, 0, 0.4);
      }

      svg {
        font-size: 10px;
      }
    }
  }
}
</style>
