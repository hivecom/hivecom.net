<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, Divider, Flex, Grid, Input, Select, Skeleton } from '@dolanske/vui'
import ProjectCard from '@/components/Community/ProjectCard.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

const supabase = useSupabaseClient()

// Reactive data
const projects = ref<Tables<'projects'>[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const isBelowExtraSmall = useBreakpoint('<xs')
const isBelowM = useBreakpoint('<m')

// Filters
const search = ref('')
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

// Fetch projects
async function fetchProjects() {
  try {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
      return
    }

    projects.value = data || []
  }
  catch (err: unknown) {
    error.value = (err as Error).message || 'An error occurred while loading projects'
  }
  finally {
    loading.value = false
  }
}

// Filtered projects
const filteredProjects = computed(() => {
  if (!projects.value)
    return []

  return projects.value.filter((project) => {
    const matchesSearch = search.value
      ? (
          project.title.toLowerCase().includes(search.value.toLowerCase())
          || project.description?.toLowerCase().includes(search.value.toLowerCase())
          || project.markdown.toLowerCase().includes(search.value.toLowerCase())
          || project.tags?.some(tag => tag.toLowerCase().includes(search.value.toLowerCase()))
        )
      : true

    // Filter by tags
    const matchesTags = tagFilter.value && tagFilter.value.length > 0
      ? tagFilter.value.some(selectedTag =>
          project.tags?.includes(selectedTag.value),
        )
      : true

    return matchesSearch && matchesTags
  }).sort((a, b) => a.title.localeCompare(b.title))
})

// Clear filters
function clearFilters() {
  search.value = ''
  tagFilter.value = []
}

// Fetch data on mount
onMounted(() => {
  fetchProjects()
})

// SEO and page metadata
useSeoMeta({
  title: 'Community Projects',
  description: 'Explore community projects and initiatives from the Hivecom community.',
  ogTitle: 'Community Projects',
  ogDescription: 'Explore community projects and initiatives from the Hivecom community.',
})
</script>

<template>
  <div class="page">
    <section>
      <h1>Projects</h1>
      <p>
        Explore projects and initiatives from our community
      </p>
    </section>

    <Divider />

    <Flex column gap="l" class="projects">
      <!-- Error message -->
      <template v-if="error">
        <ErrorAlert message="An error occurred while fetching projects." :error="error" />
      </template>

      <!-- Loading skeletons -->
      <Flex v-if="loading" column gap="l" class="projects__loading" expand>
        <Flex gap="s" x-start class="projects__filters" y-center wrap expand>
          <Skeleton width="100%" :height="36" :radius="8" />
          <Skeleton width="100%" :height="36" :radius="8" />
        </Flex>
        <Grid :columns="isBelowM ? 1 : 2" column gap="m" class="projects__grid--loading" expand>
          <template v-for="i in 6" :key="i">
            <Flex column gap="s" class="project-card-skeleton" expand>
              <Skeleton :height="260" :radius="8" />
            </Flex>
          </template>
        </Grid>
      </Flex>

      <template v-if="!loading && !error">
        <!-- Filters -->
        <Flex gap="s" x-start class="projects__filters" y-center wrap expand>
          <Input v-model="search" placeholder="Search projects" :expand="isBelowExtraSmall">
            <template #start>
              <Icon name="ph:magnifying-glass" />
            </template>
          </Input>
          <Select
            v-model="tagFilter"
            :options="tagOptions"
            placeholder="Filter by tags"
            search
            show-clear
            :single="false"
            :expand="isBelowExtraSmall"
          />
          <Button
            v-if="search || (tagFilter && tagFilter.length > 0)"
            plain
            outline
            :expand="isBelowExtraSmall"
            @click="clearFilters"
          >
            Clear
          </Button>
        </Flex>

        <!-- Content -->
        <template v-if="filteredProjects.length > 0">
          <!-- All projects at full width -->
          <Grid :columns="isBelowM ? 1 : 2" column gap="m" class="projects__section" expand>
            <ProjectCard
              v-for="(project, index) in filteredProjects"
              :key="project.id"
              :project="project"
              :is-latest="index === 0"
            />
          </Grid>
        </template>

        <!-- No content -->
        <template v-else>
          <Alert variant="info">
            <template v-if="search || tagFilter.length > 0">
              No projects match your current filters.
            </template>
            <template v-else>
              No projects found.
            </template>
          </Alert>
        </template>
      </template>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.projects__filters {
  margin-bottom: var(--space-s);
}

.projects__featured {
  width: 100%;
  margin-bottom: var(--space-l);
}

.projects__grid--regular,
.projects__grid--filtered,
.projects__grid--loading {
  .vui-grid__item {
    display: flex;
    align-items: stretch;
  }

  .project-card-skeleton {
    width: 100%;
  }

  .project-card {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .project-card__content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .project-card__description {
    flex: 1;
  }
}
</style>
