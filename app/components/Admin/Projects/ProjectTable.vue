<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import GitHubLink from '@/components/Shared/GitHubLink.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import ProjectDetails from './ProjectDetails.vue'
import ProjectFilters from './ProjectFilters.vue'
import ProjectForm from './ProjectForm.vue'

interface SelectOption {
  label: string
  value: string
}

interface TransformedProject extends Record<string, unknown> {
  Title: string
  Tags: string[] | null
  Owner: string | null
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')

const projectsQuery = supabase.from('projects').select(`
  *,
  owner_profile:owner(username)
`)

type QueryProject = QueryData<typeof projectsQuery>[0]

// Tag filter kept local - goes beyond simple search
const tagFilter = ref<SelectOption[]>([])

const {
  items: projects,
  loading,
  errorMessage,
  filteredRows: searchFilteredRows,
  totalCount,
  search,
  selectedItem: selectedProject,
  showDetails: showProjectDetails,
  showForm: showProjectForm,
  isEditMode,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewProject,
  openAdd: openAddProjectForm,
  openEdit: openEditProjectForm,
  handleEditFromDetails,
  refresh: fetchProjects,
} = useAdminCrudTable<QueryProject, TransformedProject>({
  resourceType: 'projects',
  queryParamKey: 'project',
  refreshSignal,
  fetch: async () => {
    const { data, error } = await projectsQuery
    if (error)
      throw error
    return data ?? []
  },
  transform: project => ({
    Title: project.title,
    Tags: project.tags || null,
    Owner: project.owner || null,
  }),
  defaultSort: { column: 'Title', direction: 'desc' },
})

// Compute tag options from loaded data
const tagOptions = computed<SelectOption[]>(() => {
  const allTags = new Set<string>()
  projects.value.forEach((project) => {
    project.tags?.forEach((tag: string) => allTags.add(tag))
  })
  return [...allTags].toSorted().map(tag => ({ label: tag, value: tag }))
})

// Apply tag filter on top of the composable's search-filtered rows
const filteredData = computed(() => {
  return searchFilteredRows.value.filter((row) => {
    if (tagFilter.value.length > 0) {
      const selected = tagFilter.value.map(o => o.value)
      if (!row._original.tags || !selected.some(tag => row._original.tags!.includes(tag)))
        return false
    }
    return true
  })
})

const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => filteredCount.value !== totalCount.value)

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Title', 'desc')

async function handleProjectSave(projectData: TablesInsert<'projects'> | TablesUpdate<'projects'>) {
  try {
    if (isEditMode.value && selectedProject.value) {
      const { error } = await supabase
        .from('projects')
        .update({
          ...projectData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedProject.value.id)
      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('projects')
        .insert({
          ...projectData,
          created_by: userId.value ?? null,
          modified_by: userId.value ?? null,
          modified_at: new Date().toISOString(),
        } as TablesInsert<'projects'>)
      if (error)
        throw error
    }

    showProjectForm.value = false
    await fetchProjects()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the project'
  }
}

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
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the project'
  }
}

function clearFilters() {
  search.value = ''
  tagFilter.value = []
}
</script>

<template>
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <ProjectFilters
          v-model:search="search"
          v-model:tag-filter="tagFilter"
          :tag-options="tagOptions"
          :expand="isBelowMedium"
          @clear-filters="clearFilters"
        />

        <Flex
          gap="s"
          :y-center="!isBelowMedium"
          :y-start="isBelowMedium"
          :wrap="isBelowMedium"
          :x-end="!isBelowMedium"
          :x-center="isBelowMedium"
          :x-start="isBelowMedium"
          :expand="isBelowMedium"
          :column-reverse="isBelowMedium"
        >
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" loading>
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Project
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="3" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <ProjectFilters
        v-model:search="search"
        v-model:tag-filter="tagFilter"
        :tag-options="tagOptions"
        :expand="isBelowMedium"
        @clear-filters="clearFilters"
      />

      <Flex
        gap="s"
        :y-center="!isBelowMedium"
        :y-start="isBelowMedium"
        :wrap="isBelowMedium"
        :x-end="!isBelowMedium"
        :x-center="isBelowMedium"
        :x-start="isBelowMedium"
        :expand="isBelowMedium"
        :column-reverse="isBelowMedium"
      >
        <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddProjectForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Project
        </Button>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
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
              <Flex v-if="project.Tags && project.Tags.length > 0" expand class="tags-cell">
                <Badge
                  v-for="tag in project.Tags"
                  :key="tag"
                  size="xs"
                  variant="neutral"
                  class="table-tag"
                >
                  {{ tag }}
                </Badge>
              </Flex>
              <span v-else class="text-color-light">No tags</span>
            </Table.Cell>
            <Table.Cell>
              <UserLink v-if="project.Owner" :user-id="project.Owner" />
              <span v-else class="text-color-light">No owner</span>
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="projects"
                :item="project._original"
                button-size="s"
                @edit="(item) => openEditProjectForm(item as QueryProject)"
                @delete="(item) => handleProjectDelete((item as QueryProject).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No projects found
      </Alert>
    </Flex>
  </Flex>

  <ProjectDetails
    v-model:is-open="showProjectDetails"
    :project="selectedProject"
    @edit="handleEditFromDetails"
    @delete="(item) => handleProjectDelete(item.id)"
  />

  <ProjectForm
    v-model:open="showProjectForm"
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

  .table-tag {
    font-size: var(--font-size-xxs);
    white-space: nowrap;
  }
}
</style>
