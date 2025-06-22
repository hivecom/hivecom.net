<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, Divider, Flex, Grid, Input, Skeleton, Switch } from '@dolanske/vui'
import AnnouncementCard from '@/components/Announcements/AnnouncementCard.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'

const supabase = useSupabaseClient()

// Reactive data
const announcements = ref<Tables<'announcements'>[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Filters
const search = ref('')
const showPinnedOnly = ref(false)

// Fetch announcements
async function fetchAnnouncements() {
  try {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
      return
    }

    announcements.value = data || []
  }
  catch (err: unknown) {
    error.value = (err as Error).message || 'An error occurred while loading announcements'
  }
  finally {
    loading.value = false
  }
}

// Filtered announcements
const filteredAnnouncements = computed(() => {
  if (!announcements.value)
    return []

  return announcements.value.filter((announcement) => {
    const matchesSearch = search.value
      ? (
          announcement.title.toLowerCase().includes(search.value.toLowerCase())
          || announcement.description?.toLowerCase().includes(search.value.toLowerCase())
          || announcement.markdown.toLowerCase().includes(search.value.toLowerCase())
        )
      : true

    const matchesPinnedFilter = showPinnedOnly.value
      ? announcement.pinned
      : true

    return matchesSearch && matchesPinnedFilter
  })
})

// Separate pinned and regular announcements
const pinnedAnnouncements = computed(() =>
  filteredAnnouncements.value.filter(a => a.pinned),
)
const regularAnnouncements = computed(() =>
  filteredAnnouncements.value.filter(a => !a.pinned),
)

// Clear filters
function clearFilters() {
  search.value = ''
  showPinnedOnly.value = false
}

// Fetch data on mount
onMounted(() => {
  fetchAnnouncements()
})

// SEO and page metadata
useSeoMeta({
  title: 'Announcements | Hivecom',
  description: 'Stay up to date with the latest announcements and news from Hivecom.',
  ogTitle: 'Announcements | Hivecom',
  ogDescription: 'Stay up to date with the latest announcements and news from Hivecom.',
})

// Page title
useHead({
  title: 'Announcements',
})
</script>

<template>
  <div class="page">
    <section>
      <h1>Announcements</h1>
      <p>
        What we've been up to and what's to come
      </p>
    </section>

    <Divider />

    <Flex column gap="l" class="announcements">
      <!-- Error message -->
      <template v-if="error">
        <ErrorAlert message="An error occurred while fetching announcements." :error="error" />
      </template>

      <!-- Loading skeletons -->
      <Flex v-if="loading" column gap="l" class="announcements__loading" expand>
        <Flex class="announcements__filters" gap="s" x-start y-center expand>
          <Skeleton :width="240" :height="32" :radius="8" />
          <Skeleton :width="120" :height="32" :radius="8" />
        </Flex>
        <Grid :columns="3" gap="m" class="announcements__grid--loading" expand>
          <template v-for="i in 6" :key="i">
            <Skeleton :height="180" :radius="8" />
          </template>
        </Grid>
      </Flex>

      <template v-if="!loading && !error">
        <!-- Filters -->
        <Flex gap="s" x-start class="announcements__filters" y-center>
          <Input v-model="search" placeholder="Search announcements">
            <template #start>
              <Icon name="ph:magnifying-glass" />
            </template>
          </Input>
          <Flex gap="s" y-center>
            <Switch v-model="showPinnedOnly" />
            <span class="text-s">Pinned only</span>
          </Flex>
          <Button
            v-if="search || showPinnedOnly"
            plain
            outline
            @click="clearFilters"
          >
            Clear
          </Button>
        </Flex>

        <!-- Content -->
        <template v-if="filteredAnnouncements.length > 0">
          <!-- Pinned announcements -->
          <Flex v-if="pinnedAnnouncements.length > 0 && !showPinnedOnly" expand column gap="m" class="announcements__section">
            <AnnouncementCard
              v-for="announcement in pinnedAnnouncements"
              :key="announcement.id"
              :announcement="announcement"
            />
          </Flex>

          <!-- Regular announcements -->
          <Flex v-if="regularAnnouncements.length > 0 && !showPinnedOnly" column gap="m" class="announcements__section" expand>
            <Grid :columns="3" gap="m" class="announcements__grid--regular" expand>
              <AnnouncementCard
                v-for="(announcement, index) in regularAnnouncements"
                :key="announcement.id"
                :announcement="announcement"
                :is-latest="index === 0"
              />
            </Grid>
          </Flex>

          <!-- All filtered announcements (when filters are active) -->
          <Flex v-if="showPinnedOnly" column gap="m" class="announcements__section" expand>
            <Grid :columns="3" gap="m" class="announcements__grid--filtered" expand>
              <AnnouncementCard
                v-for="(announcement, index) in filteredAnnouncements"
                :key="announcement.id"
                :announcement="announcement"
                :is-latest="index === 0"
              />
            </Grid>
          </Flex>
        </template>

        <!-- No content -->
        <template v-else>
          <Alert variant="info">
            <template v-if="search || showPinnedOnly">
              No announcements match your current filters.
            </template>
            <template v-else>
              No announcements found.
            </template>
          </Alert>
        </template>
      </template>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.announcements__filters {
  margin-bottom: var(--space-s);
}

.announcements__grid--regular,
.announcements__grid--filtered,
.announcements__grid--loading {
  .vui-grid__item {
    display: flex;
    align-items: stretch;
  }

  .announcement-card {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .announcement-card__content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .announcement-card__description {
    flex: 1;
  }
}
</style>
