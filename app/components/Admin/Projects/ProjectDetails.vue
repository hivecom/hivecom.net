<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Flex, Sheet } from '@dolanske/vui'
import { computed } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import GitHubLink from '@/components/Shared/GitHubLink.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'

const props = defineProps<{
  project: Tables<'projects'> | null
}>()

// Define emits
const emit = defineEmits<{
  edit: [project: Tables<'projects'>]
  delete: [project: Tables<'projects'>]
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

const { bannerUrl: projectBannerUrl } = useDataProjectBanner(
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
            <NuxtLink :to="`/community/projects/${props.project.id}`" target="_blank">
              {{ props.project.title }}
            </NuxtLink>
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
        <DetailTable>
          <template #header>
            <Icon name="ph:folder" />
            <h6>Overview</h6>
          </template>

          <DetailRow label="ID">
            <CopyValue :text="String(props.project.id)" link />
          </DetailRow>

          <DetailRow label="Owner">
            <UserLink v-if="props.project.owner" :user-id="props.project.owner" class="text-s" show-avatar />
            <span v-else class="project-details__not-assigned text-s">Not Assigned</span>
          </DetailRow>

          <DetailRow label="Created">
            <TimestampDate :date="props.project.created_at" size="s" class="text-color" />
          </DetailRow>

          <DetailRow label="Link" :hidden="!props.project.link">
            <NuxtLink external :href="props.project.link ?? ''" target="_blank" class="color-accent text-s">
              {{ props.project.link }}
            </NuxtLink>
          </DetailRow>

          <DetailRow label="GitHub" :hidden="!props.project.github">
            <GitHubLink :github="props.project.github ?? ''" :show-icon="true" />
          </DetailRow>

          <DetailRow label="Tags" :hidden="!props.project.tags || props.project.tags.length === 0" wrap>
            <Badge
              v-for="tag in props.project.tags"
              :key="tag"
              size="m"
              variant="neutral"
            >
              {{ tag }}
            </Badge>
          </DetailRow>
        </DetailTable>

        <!-- Banner -->
        <div v-if="projectBannerUrl" class="project-details__banner-card">
          <div
            class="project-details__banner-preview"
            :style="{ backgroundImage: `url(${projectBannerUrl})` }"
            role="img"
            :aria-label="`${props.project.title} banner preview`"
          />
        </div>

        <!-- Description -->
        <DetailTable v-if="props.project.description">
          <template #header>
            <Icon name="ph:text-align-left" />
            <h6>Description</h6>
          </template>
          <div class="project-details__description">
            <p class="text-s">
              {{ props.project.description }}
            </p>
          </div>
        </DetailTable>

        <!-- Markdown Content -->
        <DetailTable v-if="props.project.markdown">
          <template #header>
            <Flex x-between y-center expand>
              <Flex y-center gap="xs">
                <Icon name="ph:article" />
                <h6>Content</h6>
              </Flex>
              <span class="text-color-lightest text-xs">Markdown</span>
            </Flex>
          </template>
          <div class="project-details__markdown-content text-s">
            <MarkdownRenderer :md="props.project.markdown" />
          </div>
        </DetailTable>

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

  &__not-assigned {
    opacity: 0.5;
  }

  &__description {
    padding: var(--space-m);
  }

  &__markdown-content {
    padding: var(--space-m);

    h1 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }

    h2 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }
  }
}

.project-details__banner-card {
  width: 100%;
  overflow: hidden;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
}

.project-details__banner-preview {
  width: 100%;
  height: 160px;
  background-size: cover;
  background-position: center;
}
</style>
