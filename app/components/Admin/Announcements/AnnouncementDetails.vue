<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

const props = defineProps<{
  announcement: Tables<'announcements'> | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(announcement: Tables<'announcements'>) {
  emit('edit', announcement)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(announcement: Tables<'announcements'>) {
  emit('delete', announcement)
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.announcement && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>Announcement Details</h4>
          <span v-if="props.announcement" class="text-color-light text-xxs">
            {{ props.announcement.title }}
          </span>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.announcement"
            resource-type="announcements"
            :item="props.announcement"
            :show-labels="true"
            @edit="(announcementItem) => handleEdit(announcementItem as Tables<'announcements'>)"
            @delete="(announcementItem) => handleDelete(announcementItem as Tables<'announcements'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.announcement" column gap="m" class="announcement-details">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="announcement-details__item" expand :columns="2">
              <span class="text-color-light text-bold">ID:</span>
              <span>{{ props.announcement.id }}</span>
            </Grid>

            <Grid class="announcement-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Title:</span>
              <span>{{ props.announcement.title }}</span>
            </Grid>

            <Grid class="announcement-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Pinned:</span>
              <Icon v-if="props.announcement.pinned" name="ph:push-pin-fill" class="color-accent" />
              <span v-else class="text-color-light">No</span>
            </Grid>

            <Grid class="announcement-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Published:</span>
              <TimestampDate
                :date="props.announcement.published_at"
                size="s"
                class="text-color"
              />
            </Grid>

            <Grid v-if="props.announcement.link" class="announcement-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Link:</span>
              <NuxtLink external :href="props.announcement.link" target="_blank" class="color-accent text-m">
                {{ props.announcement.link }}
              </NuxtLink>
            </Grid>

            <Grid v-if="props.announcement.tags && props.announcement.tags.length > 0" class="announcement-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Tags:</span>
              <div class="tags-display">
                <Badge
                  v-for="tag in props.announcement.tags"
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
        <Card v-if="props.announcement.description" separators>
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.announcement.description }}</p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.announcement.markdown" separators>
          <template #header>
            <h6>Content</h6>
          </template>

          <MDRenderer :md="props.announcement.markdown" class="announcement-details__markdown-content" />
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.announcement.created_at"
          :created-by="props.announcement.created_by"
          :modified-at="props.announcement.modified_at"
          :modified-by="props.announcement.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.announcement-details {
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
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
