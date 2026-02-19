<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import { computed } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import GitHubLink from '@/components/Shared/GitHubLink.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useCacheProjectBanner } from '@/composables/useCacheProjectBanner'

const props = defineProps<{
  project: Tables<'projects'> | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

const { bannerUrl: projectBannerUrl } = useCacheProjectBanner(
  computed(() => props.project?.id ?? null),
)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(project: Tables<'projects'>) {
  emit('edit', project)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(project: Tables<'projects'>) {
  emit('delete', project)
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.project && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Project Details</h4>
          <p v-if="props.project" class="text-color-light text-xs">
            {{ props.project.title }}
          </p>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.project"
            resource-type="projects"
            :item="props.project"
            :show-labels="true"
            @edit="(projectItem) => handleEdit(projectItem as Tables<'projects'>)"
            @delete="(projectItem) => handleDelete(projectItem as Tables<'projects'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.project" column gap="m" class="project-details">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card class="card-bg">
          <Flex column gap="l" expand>
            <Grid class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">ID:</span>
              <span>{{ props.project.id }}</span>
            </Grid>

            <Grid class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Title:</span>
              <span>{{ props.project.title }}</span>
            </Grid>

            <Grid class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Banner:</span>
              <div class="project-details__banner">
                <div
                  v-if="projectBannerUrl"
                  class="project-details__banner-preview"
                  :style="{ backgroundImage: `url(${projectBannerUrl})` }"
                  role="img"
                  :aria-label="`${props.project.title} banner preview`"
                />
                <span v-else class="project-details__not-assigned">No banner provided</span>
              </div>
            </Grid>

            <Grid class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Owner:</span>
              <div :class="{ 'project-details__not-assigned': !props.project.owner }">
                <UserLink v-if="props.project.owner" :user-id="props.project.owner" />
                <span v-else>Not Assigned</span>
              </div>
            </Grid>

            <Grid class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Created:</span>
              <TimestampDate
                :date="props.project.created_at"
                size="s"
                class="text-color"
              />
            </Grid>

            <Grid v-if="props.project.link" class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Link:</span>
              <NuxtLink external :href="props.project.link" target="_blank" class="color-accent text-m">
                {{ props.project.link }}
              </NuxtLink>
            </Grid>

            <Grid v-if="props.project.github" class="project-details__item" expand :columns="2" y-center>
              <span class="text-color-light text-bold">GitHub:</span>
              <GitHubLink :github="props.project.github" :show-icon="true" />
            </Grid>

            <Grid v-if="props.project.tags && props.project.tags.length > 0" class="project-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Tags:</span>
              <div class="tags-display">
                <Badge
                  v-for="tag in props.project.tags"
                  :key="tag"
                  size="xs"
                  variant="neutral"
                >
                  {{ tag }}
                </Badge>
              </div>
            </Grid>
          </Flex>
        </Card>

        <!-- Description -->
        <Card v-if="props.project.description" separators class="card-bg">
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.project.description }}</p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.project.markdown" separators class="card-bg">
          <template #header>
            <h6>Content</h6>
          </template>

          <MDRenderer :md="props.project.markdown" class="project-details__markdown-content" />
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.project.created_at"
          :created-by="props.project.created_by"
          :modified-at="props.project.modified_at"
          :modified-by="props.project.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.project-details {
  padding-bottom: var(--space);

  &__markdown-content {
    h1 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }

    h2 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }
  }

  &__not-assigned {
    opacity: 0.5;
  }
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.project-details__banner {
  width: 100%;
}

.project-details__banner-preview {
  width: 100%;
  height: 120px;
  border-radius: var(--border-radius-s);
  background-size: cover;
  background-position: center;
  border: 1px solid var(--color-border);
}
</style>
