<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex } from '@dolanske/vui'
import DetailStates from '@/components/Shared/DetailStates.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import MetadataCard from '@/components/Shared/MetadataCard.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

// Get route parameter
const route = useRoute()
const announcementId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Reactive data
const announcement = ref<Tables<'announcements'> | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Fetch announcement data
async function fetchAnnouncement() {
  try {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', announcementId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        error.value = 'Announcement not found'
      }
      else {
        error.value = fetchError.message
      }
      return
    }

    announcement.value = data
  }
  catch (err: unknown) {
    error.value = (err as Error).message || 'An error occurred while loading the announcement'
  }
  finally {
    loading.value = false
  }
}

// Fetch data on mount
onMounted(() => {
  fetchAnnouncement()
})

// SEO and page metadata
useSeoMeta({
  title: computed(() => announcement.value ? `${announcement.value.title} | Announcements` : 'Announcement Details'),
  description: computed(() => announcement.value?.description || 'Announcement details'),
  ogTitle: computed(() => announcement.value ? `${announcement.value.title} | Announcements` : 'Announcement Details'),
  ogDescription: computed(() => announcement.value?.description || 'Announcement details'),
})

// Page title
useHead({
  title: computed(() => announcement.value ? announcement.value.title : 'Announcement Details'),
})
</script>

<template>
  <div class="page">
    <DetailStates
      :loading="loading"
      :error="error"
      back-to="/announcements"
      back-label="Back to Announcements"
    >
      <template #error-message>
        The announcement you're looking for might have been removed or doesn't exist.
      </template>
    </DetailStates>

    <!-- Announcement Content -->
    <div v-if="announcement && !loading && !error" class="page-content">
      <!-- Back Button -->
      <Flex x-between>
        <Button
          variant="gray"
          size="s"
          aria-label="Go back to Announcements page"
          class="event-detail__back-link"
          @click="$router.push('/announcements')"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Announcements
        </Button>
      </Flex>

      <!-- Header -->
      <Card class="announcement-header" expand>
        <Flex column gap="m" expand>
          <!-- Title, pinned badge, and posted by -->
          <Flex gap="m" y-center x-between expand>
            <div class="announcement-header__title-group">
              <h1 class="announcement-header__title">
                {{ announcement.title }}
              </h1>
              <Badge v-if="announcement.pinned" variant="accent" class="announcement-header__pinned-badge">
                <Icon name="ph:push-pin-fill" />
                Pinned
              </Badge>
            </div>
            <Flex gap="s" y-center>
              <Icon name="ph:calendar" />
              <TimestampDate :date="announcement.created_at" format="dddd, MMM D, YYYY [at] HH:mm" />
            </Flex>
          </Flex>

          <!-- Description -->
          <p v-if="announcement.description" class="announcement-header__description">
            {{ announcement.description }}
          </p>

          <!-- Meta information -->
          <Flex gap="l" x-between y-center class="announcement-header__meta">
            <div v-if="announcement.created_by" class="announcement-header__posted-by">
              <UserDisplay :user-id="announcement.created_by" show-role />
            </div>
            <NuxtLink
              v-if="announcement.link"
              :href="announcement.link"
              external
              target="_blank"
            >
              <Button
                outline
                size="s"
              >
                <template #start>
                  <Icon name="ph:arrow-square-out" />
                </template>
                Open Link
              </Button>
            </NuxtLink>
          </Flex>
        </Flex>
      </Card>

      <!-- Announcement Content (Markdown) -->
      <Card class="announcement-content">
        <MDRenderer :md="announcement.markdown" />
      </Card>

      <!-- Announcement Metadata -->
      <MetadataCard
        :tags="announcement.tags"
        :created-at="announcement.created_at"
        :created-by="announcement.created_by"
        :modified-at="announcement.modified_at"
        :modified-by="announcement.modified_by"
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

.announcement-header {
  position: relative;
}

.announcement-header__title-group {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  flex-wrap: wrap;
}

.announcement-header__title {
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0;
  line-height: 1.2;
}

.announcement-header__pinned-badge {
  flex-shrink: 0;
}

.announcement-header__posted-by {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
  flex-shrink: 0;
}

.announcement-header__posted-by-label {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  font-weight: var(--font-weight-medium);
}

.announcement-header__description {
  font-size: var(--font-size-l);
  color: var(--color-text-light);
  margin: 0;
  line-height: 1.6;
}

.announcement-header__meta {
  font-size: var(--font-size-s);
  color: var(--color-text-light);

  svg {
    color: var(--color-accent);
  }
}

.announcement-content {
  line-height: 1.6;
}

@media (max-width: 768px) {
  .announcement-header__title {
    font-size: var(--font-size-xxl);
  }

  .announcement-header__title-group {
    flex-direction: column;
    align-items: flex-start;
  }

  .announcement-header__posted-by {
    align-items: flex-start;
    margin-top: var(--space-s);
  }

  .announcement-header {
    .announcement-header__title-group,
    .announcement-header__posted-by {
      width: 100%;
    }
  }
}
</style>
