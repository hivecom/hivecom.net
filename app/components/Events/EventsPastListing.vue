<script setup lang="ts">
import { Flex, Grid, paginate, Pagination, Skeleton } from '@dolanske/vui'
import { useDataEventsPaged } from '@/composables/useDataEventsPaged'
import { useBreakpoint } from '@/lib/mediaQuery'
import EventPast from './EventPast.vue'

interface Props {
  search?: string
  officialFilter?: boolean | null
}

const props = withDefaults(defineProps<Props>(), {
  search: '',
  officialFilter: null,
})

const searchRef = computed(() => props.search)
const officialFilterRef = computed(() => props.officialFilter)

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

const { pastEvents, pastTotalCount, pastPage, loadingPast, setPage } = useDataEventsPaged(pageSize, searchRef, officialFilterRef)

const pastPagination = computed(() => paginate(pastTotalCount.value, pastPage.value, pageSize.value))
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

    <div v-if="loadingPast">
      <Grid :columns="columns" gap="m">
        <Skeleton v-for="i in pageSize" :key="`past-loading-${i}`" :height="164" :radius="8" />
      </Grid>
    </div>

    <template v-else>
      <Grid class="events-section__past-grid" :columns="columns" gap="m">
        <EventPast
          v-for="event in pastEvents"
          :key="event.id"
          :data="event"
        />
      </Grid>

      <Flex v-if="pastPagination.totalPages > 1" x-center class="mt-l">
        <Pagination :pagination="pastPagination" @change="setPage($event)" />
      </Flex>
    </template>
  </div>
</template>
