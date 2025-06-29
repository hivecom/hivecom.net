<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'

import GitHubLink from '@/components/Shared/GitHubLink.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import ProjectDetails from './ProjectDetails.vue'
import ProjectFilters from './ProjectFilters.vue'
import ProjectForm from './ProjectForm.vue'

// Type from the query result
type QueryProject = QueryData<typeof projectsQuery>[0]

// Define interface for transformed project data
interface TransformedProject {
  Title: string
  Tags: string[] | null
  Owner: string | null
  _original: QueryProject
}

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('projects')

// Define query
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const projectsQuery = supabase.from('projects').select(`
  *,
  owner_profile:owner(username)
`)

// Data states
const loading = ref(true)
const errorMessage = ref('')
const projects = ref<QueryData<typeof projectsQuery>>([])
const search = ref('')

// Filter states
const tagFilter = ref<SelectOption[]>([])

// Compute unique tag options from all projects
const tagOptions = computed<SelectOption[]>(() => {
  const allTags = new Set<string>()
  projects.value.forEach((project) => {
    if (project.tags) {
      project.tags.forEach(tag => allTags.add(tag))
    }
  })
  return Array.from(allTags).sort().map(tag => ({
    label: tag,
    value: tag,
  }))
})

// Project detail state
const selectedProject = ref<QueryProject | null>(null)
const showProjectDetails = ref(false)

// Project form state
const showProjectForm = ref(false)
const isEditMode = ref(false)

// Filter based on search and tags
const filteredData = computed<TransformedProject[]>(() => {
  const filtered = projects.value.filter((item) => {
    // Filter by search term
    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false
      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    // Filter by tags
    if (tagFilter.value && tagFilter.value.length > 0) {
      const selectedTags = tagFilter.value.map((option: SelectOption) => option.value)
      if (!item.tags || !selectedTags.some((tag: string) => item.tags!.includes(tag))) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map(project => ({
    Title: project.title,
    Tags: project.tags || null,
    Owner: project.owner || null, // Store the user ID, not the username
    // Keep the original object to use when emitting events
    _original: project,
  }))
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting.
setSort('Title', 'desc')

// Fetch projects data
async function fetchProjects() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await projectsQuery

    if (error) {
      throw error
    }

    projects.value = data || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading projects'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View project details
function viewProject(project: QueryProject) {
  selectedProject.value = project
  showProjectDetails.value = true
}

// Open the add project form
function openAddProjectForm() {
  selectedProject.value = null
  isEditMode.value = false
  showProjectForm.value = true
}

// Open the edit project form
function openEditProjectForm(project: QueryProject, event?: Event) {
  // Prevent the click from triggering the view details
  if (event)
    event.stopPropagation()

  selectedProject.value = project
  isEditMode.value = true
  showProjectForm.value = true
}

// Handle edit from ProjectDetails
function handleEditFromDetails(project: QueryProject) {
  openEditProjectForm(project)
}

// Handle project save (both create and update)
async function handleProjectSave(projectData: TablesInsert<'projects'> | TablesUpdate<'projects'>) {
  try {
    if (isEditMode.value && selectedProject.value) {
      // Update existing project
      const updateData = {
        ...projectData,
        modified_at: new Date().toISOString(),
        modified_by: user.value?.id,
      }

      const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', selectedProject.value.id)

      if (error)
        throw error
    }
    else {
      // Create new project with creation and modification tracking
      const createData = {
        ...projectData,
        created_by: user.value?.id,
        modified_by: user.value?.id,
        modified_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('projects')
        .insert(createData as TablesInsert<'projects'>)

      if (error)
        throw error
    }

    // Refresh projects data and close form
    showProjectForm.value = false
    await fetchProjects()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while saving the project'
  }
}

// Handle project deletion
async function handleProjectDelete(projectId: number) {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error)
      throw error

    showProjectForm.value = false
    await fetchProjects()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while deleting the project'
  }
}

// Clear all filters
function clearFilters() {
  search.value = ''
  tagFilter.value = []
}

// Lifecycle hooks
onBeforeMount(fetchProjects)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <!-- Header and filters -->
      <Flex x-between expand>
        <ProjectFilters
          v-model:search="search"
          v-model:tag-filter="tagFilter"
          :tag-options="tagOptions"
          @clear-filters="clearFilters"
        />

        <Button v-if="canCreate" variant="accent" loading>
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Project
        </Button>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="5"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <ProjectFilters
        v-model:search="search"
        v-model:tag-filter="tagFilter"
        :tag-options="tagOptions"
        @clear-filters="clearFilters"
      />

      <Button v-if="canCreate" variant="accent" @click="openAddProjectForm">
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Add Project
      </Button>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions" :header="{ label: 'Actions',
                                     sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="project in rows" :key="project._original.id" class="clickable-row" @click="viewProject(project._original as QueryProject)">
            <Table.Cell>
              <Flex gap="xs" y-center>
                <span>{{ project.Title }}</span>
                <GitHubLink
                  v-if="project._original.github"
                  :github="project._original.github"
                  :show-icon="true"
                  :hide-repo="true"
                  small
                  @click.stop
                />
              </Flex>
            </Table.Cell>
            <Table.Cell>
              <div v-if="project.Tags && project.Tags.length > 0" class="tags-cell">
                <Badge
                  v-for="tag in project.Tags"
                  :key="tag"
                  size="xs"
                  variant="neutral"
                  class="table-tag"
                >
                  {{ tag }}
                </Badge>
              </div>
              <span v-else class="color-text-light">No tags</span>
            </Table.Cell>
            <Table.Cell>
              <UserLink v-if="project.Owner" :user-id="project.Owner" />
              <span v-else class="color-text-light">No owner</span>
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="announcements"
                :item="project._original"
                @edit="(projectItem) => openEditProjectForm(projectItem as QueryProject)"
                @delete="(projectItem) => handleProjectDelete((projectItem as QueryProject).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > 10" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <!-- No results message -->
    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No projects found
      </Alert>
    </Flex>
  </Flex>

  <!-- Project Detail Sheet -->
  <ProjectDetails
    v-model:is-open="showProjectDetails"
    :project="selectedProject"
    @edit="handleEditFromDetails"
    @delete="(projectItem) => handleProjectDelete(projectItem.id)"
  />

  <!-- Project Form Sheet (for both create and edit) -->
  <ProjectForm
    v-model:is-open="showProjectForm"
    :project="selectedProject"
    :is-edit-mode="isEditMode"
    @save="handleProjectSave"
    @delete="handleProjectDelete"
  />
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}
.w-100 {
  width: 100%;
}

td {
  vertical-align: middle;
}

.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}

.tags-cell {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  max-width: 200px; // Limit width to prevent table from becoming too wide

  .table-tag {
    font-size: var(--font-size-xxs);
    white-space: nowrap;
  }
}
</style>
