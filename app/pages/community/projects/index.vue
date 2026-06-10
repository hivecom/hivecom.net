<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Alert, Button, Flex, Grid, Input, Select, Skeleton } from '@dolanske/vui'
import ProjectCard from '@/components/Community/ProjectCard.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useDataProjects } from '@/composables/useDataProjects'
import { useBreakpoint } from '@/lib/mediaQuery'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

const isBelowExtraSmall = useBreakpoint('<xs')

// Reactive data
const { projects, error } = useDataProjects()
const supabase = useSupabaseClient<Database>()
const { data: ssrProjects, status } = await useAsyncData('projects:all', async () => {
  const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
  return data ?? []
})
if (ssrProjects.value && ssrProjects.value.length > 0 && projects.value.length === 0) {
  projects.value = ssrProjects.value
}

const isLoading = computed(() => status.value === 'pending' || (status.value === 'success' && projects.value.length === 0 && (ssrProjects.value?.length ?? 0) > 0))
const isAtLeastM = useBreakpoint('>=m')

// Filters
const search = ref('')
const tagFilter = ref<SelectOption[]>([])

type SortOption = 'title-asc' | 'title-desc' | 'date-asc' | 'date-desc'
const sortOptions: SelectOption[] = [
  { label: 'Name (A-Z)', value: 'title-asc' },
  { label: 'Name (Z-A)', value: 'title-desc' },
  { label: 'Newest first', value: 'date-desc' },
  { label: 'Oldest first', value: 'date-asc' },
]
const sortSelection = ref<SelectOption[]>([sortOptions[0]!])
const currentSort = computed<SortOption>(() => (sortSelection.value[0]?.value as SortOption) ?? 'title-asc')

// Compute unique tag options from all projects
const tagOptions = computed<SelectOption[]>(() => {
  const allTags = new Set<string>()
  projects.value.forEach((project) => {
    if (project.tags) {
      project.tags.forEach(tag => allTags.add(tag))
    }
  })
  return [...allTags].toSorted().map((tag: string) => ({
    label: tag,
    value: tag,
  }))
})

// Filtered projects
const filteredProjects = computed(() => {
  if (!projects.value.length)
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
  }).sort((a, b) => {
    switch (currentSort.value) {
      case 'title-desc': return b.title.localeCompare(a.title)
      case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'title-asc':
      default: return a.title.localeCompare(b.title)
    }
  })
})

// Clear filters
function clearFilters() {
  search.value = ''
  tagFilter.value = []
  sortSelection.value = [sortOptions[0]!]
}

// SEO and page metadata
useSeoMeta({
  title: 'Community Projects',
  description: 'Explore community projects and initiatives from the Hivecom community.',
  ogTitle: 'Community Projects',
  ogDescription: 'Explore community projects and initiatives from the Hivecom community.',
})

defineOgImage('Default', {
  title: 'Community Projects',
  description: 'Explore community projects and initiatives from the Hivecom community.',
})
</script>

<template>
  <div class="page container-l">
    <section class="page-title">
      <h1>Projects</h1>
      <p>
        Explore projects and initiatives from our community
      </p>
    </section>

    <Flex column gap="l" class="projects">
      <!-- Error message -->
      <template v-if="error">
        <ErrorAlert message="An error occurred while fetching projects." :error="error" />
      </template>

      <!-- Loading skeletons -->
      <Flex v-if="isLoading" column gap="l" class="projects__loading" expand>
        <Flex gap="s" x-start y-center wrap expand>
          <Skeleton width="100%" :height="36" :radius="8" />
          <Skeleton width="100%" :height="36" :radius="8" />
        </Flex>
        <Grid :columns="isAtLeastM ? 2 : 1" column gap="m" class="projects__grid--loading" expand>
          <template v-for="i in 6" :key="i">
            <Flex column gap="s" class="project-card-skeleton" expand>
              <Skeleton :height="260" :radius="8" />
            </Flex>
          </template>
        </Grid>
      </Flex>

      <template v-if="!isLoading && !error">
        <!-- Filters -->
        <Flex gap="s" x-start y-center wrap expand>
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
          <Select
            v-model="sortSelection"
            :options="sortOptions"
            :single="true"
            :expand="isBelowExtraSmall"
          />
          <Button
            v-if="search || (tagFilter && tagFilter.length > 0) || currentSort !== 'title-asc'"
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
          <GlowGroup>
            <Grid :columns="isAtLeastM ? 2 : 1" column gap="m" class="projects__section" expand>
              <ProjectCard
                v-for="(project) in filteredProjects"
                :key="project.id"
                :project="project"
              />
            </Grid>
          </GlowGroup>
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
