<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Card, Flex } from '@dolanske/vui'
import DetailStates from '@/components/Shared/DetailStates.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import MetadataCard from '@/components/Shared/MetadataCard.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

// Get route parameter
const route = useRoute()
const projectId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Reactive data
const project = ref<Tables<'projects'> | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Fetch project data
async function fetchProject() {
  try {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        error.value = 'Project not found'
      }
      else {
        error.value = fetchError.message
      }
      return
    }

    project.value = data
  }
  catch (err: unknown) {
    error.value = (err as Error).message || 'An error occurred while loading the project'
  }
  finally {
    loading.value = false
  }
}

// Fetch data on mount
onMounted(() => {
  fetchProject()
})

// SEO and page metadata
useSeoMeta({
  title: computed(() => project.value ? `${project.value.title} | Community Projects` : 'Project Details'),
  description: computed(() => project.value?.description || 'Community project details'),
  ogTitle: computed(() => project.value ? `${project.value.title} | Community Projects` : 'Project Details'),
  ogDescription: computed(() => project.value?.description || 'Community project details'),
})

// Page title
useHead({
  title: computed(() => project.value ? project.value.title : 'Project Details'),
})
</script>

<template>
  <div class="page">
    <DetailStates
      :loading="loading"
      :error="error"
      back-to="/community/projects"
      back-label="Projects"
    >
      <template #error-message>
        The project you're looking for might have been removed or doesn't exist.
      </template>
    </DetailStates>

    <!-- Project Content -->
    <div v-if="project && !loading && !error" class="page-content">
      <!-- Back Button -->
      <Flex x-between>
        <Button
          variant="gray"
          size="s"
          aria-label="Go back to Projects page"
          class="event-detail__back-link"
          @click="$router.push('/community/projects')"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Projects
        </Button>
      </Flex>
      <!-- Header -->
      <Card class="project-header" expand>
        <Flex column gap="m" expand>
          <!-- Title and created date -->
          <Flex gap="m" y-center x-between expand>
            <div class="project-header__title-group">
              <h1 class="project-header__title">
                {{ project.title }}
              </h1>
            </div>
          </Flex>

          <!-- Description -->
          <p v-if="project.description" class="project-header__description">
            {{ project.description }}
          </p>

          <!-- Meta information -->
          <Flex gap="l" x-between y-center class="project-header__meta" expand>
            <div v-if="project.owner" class="project-header__owner">
              <UserDisplay :user-id="project.owner" show-role />
            </div>
            <Flex gap="s" y-center>
              <NuxtLink
                v-if="project.link"
                :href="project.link"
                external
                target="_blank"
              >
                <Button
                  size="s"
                >
                  <template #start>
                    <Icon name="ph:arrow-square-out" />
                  </template>
                  Open Link
                </Button>
              </NuxtLink>
              <NuxtLink
                v-if="project.github"
                :href="`https://github.com/${project.github}`"
                external
                target="_blank"
              >
                <Button
                  size="s"
                >
                  <template #start>
                    <Icon name="ph:github-logo" />
                  </template>
                  View on GitHub
                </Button>
              </NuxtLink>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <!-- Project Content (Markdown) -->
      <Card class="project-content">
        <MDRenderer :md="project.markdown" />
      </Card>

      <!-- Project Metadata -->
      <MetadataCard
        :tags="project.tags"
        :created-at="project.created_at"
        :created-by="project.created_by"
        :modified-at="project.modified_at"
        :modified-by="project.modified_by"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}

.project-header {
  position: relative;
}

.project-header__title-group {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  flex-wrap: wrap;
}

.project-header__title {
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0;
  line-height: 1.2;
}

.project-header__tags {
  opacity: 0.9;
  color: var(--color-text-light);
}

.project-header__owner {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}

.project-header__label {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  font-weight: var(--font-weight-medium);
  min-width: 80px;
}

.project-header__description {
  font-size: var(--font-size-l);
  color: var(--color-text-light);
  margin: 0;
  line-height: 1.6;
}

.project-content {
  line-height: 1.6;
}

@media (max-width: 768px) {
  .project-header__title {
    font-size: var(--font-size-xxl);
  }

  .project-header__title-group {
    flex-direction: column;
    align-items: flex-start;
  }

  .project-header {
    .project-header__title-group {
      width: 100%;
    }
  }

  .project-header__meta {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-m);
  }
}
</style>
