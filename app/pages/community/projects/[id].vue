<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import MetadataCard from '@/components/Shared/MetadataCard.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useDataProjectBanner } from '@/composables/useDataProjectBanner'
import { useDataProjects } from '@/composables/useDataProjects'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getPlaceholderBannerProject } from '@/lib/projectBannerPlaceholders'

const isMobile = useBreakpoint('<s')

// Get route parameter
const route = useRoute()
const projectId = Number.parseInt(route.params.id as string)

// Reactive data
const { projects, loading, error: projectsError, getById } = useDataProjects()
const project = ref<Tables<'projects'> | null>(null)
const error = ref<string | null>(null)

const { bannerUrl: projectBannerUrl } = useDataProjectBanner(
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

// Resolve project from cache once loaded
watch([projects, loading], () => {
  const found = getById(projectId)
  if (found != null) {
    project.value = found
  }
  else if (!loading.value && projects.value.length > 0) {
    // Only report not-found after the fetch has completed and returned data
    error.value = 'Project not found'
  }
}, { immediate: true })

// Propagate projects fetch error
watch(projectsError, (err) => {
  if (err != null)
    error.value = err
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
          <Flex column gap="m" expand :y-center="isMobile">
            <h1 class="project-header__title">
              {{ project.title }}
            </h1>

            <p v-if="project.description" class="project-header__description">
              {{ project.description }}
            </p>

            <!-- Meta information -->
            <Flex :column="isMobile" :gap="isMobile ? 's' : 'l'" :x-between="!isMobile" :x-center="isMobile" y-center wrap expand>
              <Flex v-if="project.owner" y-center gap="xs">
                <span class="text-s text-color-light">Project by</span>
                <UserDisplay :user-id="project.owner" size="s" :show-profile-preview="true" :hide-avatar="false" />
              </Flex>
              <Flex gap="s" :column="isMobile" :expand="isMobile" class="project-header__actions">
                <Button
                  v-if="project.link"
                  class="project-header__action"
                  :size="isMobile ? 'l' : 's'"
                  :href="project.link"
                  target="_blank"
                  expand
                >
                  <template #start>
                    <Icon name="ph:arrow-square-out" />
                  </template>
                  Open Link
                </Button>
                <Button
                  v-if="project.github"
                  class="project-header__action"
                  :size="isMobile ? 'l' : 's'"
                  :href="`https://github.com/${project.github}`"
                  target="_blank"
                  expand
                >
                  <template #start>
                    <Icon name="ph:github-logo" />
                  </template>
                  View on GitHub
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </div>
      </Card>

      <!-- Project Content (Markdown) -->
      <Card class="project-content card-bg">
        <div class="project-content__markdown">
          <MarkdownRenderer :md="project.markdown" />
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
}

.project-header__title {
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0;
  line-height: 1.2;
}

.project-header__description {
  font-size: var(--font-size-l);
  color: var(--color-text-light);
  margin: 0;
  line-height: 1.6;
}

.project-header__action {
  white-space: nowrap;
}

.project-content {
  &__markdown {
    padding: var(--space-m);
    margin-bottom: var(--space-xl);
  }
}

@media (max-width: 768px) {
  .project-header__banner {
    height: 180px;
  }

  .project-header__body {
    padding: var(--space-m);
  }

  .project-header__title {
    font-size: var(--font-size-xxl);
    text-align: center;
  }

  .project-header__description {
    text-align: center;
  }
}
</style>
