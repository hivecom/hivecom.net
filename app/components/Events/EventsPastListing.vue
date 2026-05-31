<script setup lang="ts">
import { Flex, Grid, paginate, Pagination, Skeleton } from '@dolanske/vui'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useDataEventsPaged } from '@/composables/useDataEventsPaged'
import { useBreakpoint } from '@/lib/mediaQuery'
import EventSmall from './EventSmall.vue'

interface Props {
  search?: string
  officialFilter?: boolean | null
  recurringFilter?: boolean | null
  gameFilter?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  search: '',
  officialFilter: null,
  recurringFilter: null,
  gameFilter: () => [],
})

const searchRef = computed(() => props.search)
const officialFilterRef = computed(() => props.officialFilter)
const recurringFilterRef = computed(() => props.recurringFilter)
const gameFilterRef = computed(() => props.gameFilter ?? [])

const isMobile = useBreakpoint('<s')
const isTablet = useBreakpoint('<m')

const columns = computed(() => {
  if (isMobile.value)
    return 1
  if (isTablet.value)
    return 2
  return 3
})

const pageSize = computed(() => isMobile.value ? 4 : 6)

const { pastEvents, pastTotalCount, pastPage, loadingPast, setPage } = useDataEventsPaged(pageSize, searchRef, officialFilterRef, recurringFilterRef, gameFilterRef)

const pastPagination = computed(() => paginate(pastTotalCount.value, pastPage.value, pageSize.value))

const hasLoadedOnce = ref(false)
watch(pastEvents, (events) => {
  if (events && events.length > 0)
    hasLoadedOnce.value = true
}, { immediate: true })

const isPaging = computed(() => loadingPast.value && hasLoadedOnce.value)
const isInitialLoad = computed(() => loadingPast.value && !hasLoadedOnce.value)
</script>

<template>
  <div v-if="pastTotalCount > 0 || loadingPast" class="events-section events-section--past">
    <Flex x-between y-center>
      <h2 class="events-section__title">
        Past Events
      </h2>
      <span class="text-color-lightest text-xs">
        {{ pastTotalCount }} event{{ pastTotalCount > 1 ? 's' : '' }}
      </span>
    </Flex>

    <div v-if="isInitialLoad">
      <Grid :columns="columns" gap="m">
        <Skeleton v-for="i in pageSize" :key="`past-loading-${i}`" :height="164" :radius="8" />
      </Grid>
    </div>

    <template v-else>
      <GlowGroup>
        <Grid
          class="events-section__past-grid"
          :class="{ 'events-section__past-grid--dimmed': isPaging }"
          :columns="columns"
          gap="m"
          y-stretch
        >
          <EventSmall
            v-for="event in pastEvents"
            :key="event.id"
            :data="event"
          />
        </Grid>
      </GlowGroup>

      <Flex v-if="pastPagination.totalPages > 1" x-center class="mt-l">
        <Pagination :pagination="pastPagination" @change="setPage($event)" />
      </Flex>
    </template>
  </div>
</template>

<style lang="scss">
.events-section__past-grid--dimmed {
  opacity: 0.4;
  pointer-events: none;
  transition: opacity var(--transition);
}
</style>
