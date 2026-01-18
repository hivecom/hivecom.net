<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Card, Flex } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import MetadataCard from '@/components/Shared/MetadataCard.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useCacheProjectBanner } from '@/composables/useCacheProjectBanner'
import { getPlaceholderBannerProject } from '@/lib/placeholderBannerProjects'

// Get route parameter
const route = useRoute()
const projectId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Reactive data
const project = ref<Tables<'projects'> | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const { bannerUrl: projectBannerUrl } = useCacheProjectBanner(
  computed(() => project.value?.id ?? null),
)

const placeholderBanner = computed(() => getPlaceholderBannerProject(project.value?.id ?? null))

const hasProjectBannerImage = computed(() => !!(projectBannerUrl.value ?? placeholderBanner.value.url))

const heroBannerStyle = computed(() => {
  const placeholder = placeholderBanner.value
  const usingPlaceholder = !projectBannerUrl.value
  const style: Record<string, string> = {
    backgroundImage: `url(${projectBannerUrl.value ?? placeholder.url})`,
  }

  if (usingPlaceholder && placeholder.transform)
    style['--banner-placeholder-transform'] = placeholder.transform

  return style
})

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
          plain
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
      <Card class="project-header card-bg" expand>
        <div class="project-header__banner">
          <div
            class="project-header__banner-surface"
            :class="{
              'project-header__banner-surface--image': hasProjectBannerImage,
            }"
            :style="heroBannerStyle"
          />
        </div>

        <div class="project-header__body">
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
              <div v-if="project.owner" class="text-s">
                Project by <UserLink :user-id="project.owner" show-role />
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
        </div>
      </Card>

      <!-- Project Content (Markdown) -->
      <Card class="project-content card-bg">
        <div class="project-content__markdown">
          <MDRenderer :md="project.markdown" />
        </div>

        <!-- Project Metadata -->
        <MetadataCard
          :tags="project.tags"
          :created-at="project.created_at"
          :created-by="project.created_by"
          :modified-at="project.modified_at"
          :modified-by="project.modified_by"
        />
      </Card>

      <!-- Related discussion -->
      <Discussion
        :id="String(project.id)"
        class="project-discussion"
        type="project"
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
  padding: 0;
  overflow: hidden;
}

.project-header__banner {
  position: relative;
  width: 100%;
  height: 240px;
  overflow: hidden;
  background: transparent;
  border-bottom: 1px solid var(--color-border);
  border-radius: var(--border-radius-s) var(--border-radius-s) 0 0;
}

.project-header__banner-surface {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  transform: var(--banner-placeholder-transform, scale(1));
  transition: transform 0.4s ease;
}

.project-header:hover .project-header__banner-surface--image {
  transform: var(--banner-placeholder-transform, scale(1)) scale(1.05);
}

.project-header__body {
  padding: var(--space-l);
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
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
  &__markdown {
    padding: var(--space-m);
    /* max-width: 728px; */
    margin-bottom: var(--space-xl);
  }
}

/* .project-discussion {
  max-width: 728px;
} */

@media (max-width: 768px) {
  .project-header__title {
    font-size: var(--font-size-xxl);
  }

  .project-header__title-group {
    flex-direction: column;
    align-items: flex-start;
  }

  .project-header {
    padding: 0;

    .project-header__banner {
      height: 180px;
    }

    .project-header__title-group {
      width: 100%;
    }
  }

  .project-header__meta {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-m);
  }

  .project-header__body {
    padding: var(--space-m);
  }
}
</style>
