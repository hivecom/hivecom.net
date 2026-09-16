<script setup lang="ts">
import { Badge, Button, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardEmpty from '@/components/Home/HomeDashboardEmpty.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import { useDataVotes } from '@/composables/useDataVotes'
import ReferendumCard from '../Shared/ReferendumCard.vue'

dayjs.extend(relativeTime)

// Votes card: active referendums I haven't voted in, then results from votes
// that wrapped up recently enough to still be news.

const RESULTS_WINDOW_DAYS = 30

const {
  activePublicItems,
  concludedPublicItems,
  fetchConcludedPublicPage,
  fetchUserVotedIds,
  fetchVoteCounts,
  getVoteCount,
  hasVoted,
  activePublicLoading,
  concludedPublicLoading,
} = useDataVotes()

onMounted(() => {
  void fetchUserVotedIds()
  void fetchConcludedPublicPage()
})

// Pull counts once both lists are in so turnout shows on everything visible.
watch([activePublicItems, concludedPublicItems], ([active, concluded]) => {
  const ids = [...active, ...concluded].map(r => r.id)
  if (ids.length > 0)
    void fetchVoteCounts(ids)
})

// The active list is "not ended yet", which includes votes that haven't opened.
// Only the ones already running count as in progress.
const inProgress = computed(() => activePublicItems.value.filter(r => dayjs(r.date_start).isBefore(dayjs())))

const needsDeciding = computed(() => inProgress.value.filter(r => !hasVoted(r.id))[0])
const alreadyVoted = computed(() => inProgress.value.filter(r => hasVoted(r.id)).slice(0, 2))

// Results go stale fast, so anything older than the window drops off the card
// instead of sitting there as the latest word.
const latestConcluded = computed(() => {
  const cutoff = dayjs().subtract(RESULTS_WINDOW_DAYS, 'day')

  return concludedPublicItems.value
    .filter(r => dayjs(r.date_end).isAfter(cutoff))
    .sort((a, b) => dayjs(b.date_end).valueOf() - dayjs(a.date_end).valueOf())
    .slice(0, 3)
})

const activeLoading = computed(() => activePublicLoading.value && activePublicItems.value.length === 0)
const concludedLoading = computed(() => concludedPublicLoading.value && concludedPublicItems.value.length === 0)

// Nothing running and nothing recent enough to report leaves the card with no
// reason to exist, so it asks for one instead.
const isEmpty = computed(() =>
  !activeLoading.value && !concludedLoading.value
  && inProgress.value.length === 0 && latestConcluded.value.length === 0,
)
</script>

<template>
  <div>
    <HomeDashboardCardHeader title="Votes" icon="ph:check-square" to="/votes">
      <Badge v-if="!activeLoading && inProgress.length" variant="info" size="s">
        {{ inProgress.length }} in progress
      </Badge>
    </HomeDashboardCardHeader>

    <HomeDashboardEmpty
      v-if="isEmpty"
      icon="ph:gavel"
      message="Nothing on the ballot. Got something the community should settle?"
    >
      <Button size="s" variant="gray" @click="navigateTo('/votes?create=1')">
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Start a vote
      </Button>
    </HomeDashboardEmpty>

    <HomeDashboardSkeleton v-if="activeLoading" variant="card" :count="1" />
    <HomeDashboardSection v-else-if="needsDeciding" label="Needs deciding">
      <ReferendumCard :referendum="needsDeciding" :vote-count="getVoteCount(needsDeciding.id)" status="active" compact />
    </HomeDashboardSection>

    <HomeDashboardSection v-if="!activeLoading && alreadyVoted.length" label="You voted, still running">
      <Flex column gap="xs">
        <ReferendumCard
          v-for="r in alreadyVoted" :key="r.id"
          :referendum="r"
          :vote-count="getVoteCount(r.id)"
          status="active"
          has-voted
          compact
        />
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="concludedLoading" variant="card" :count="3" />
    <HomeDashboardSection v-else-if="latestConcluded.length" :label="`Results from the last ${RESULTS_WINDOW_DAYS} days`">
      <Flex column gap="xs">
        <ReferendumCard
          v-for="r in latestConcluded" :key="r.id"
          :referendum="r"
          :vote-count="getVoteCount(r.id)"
          status="concluded"
          compact
        />
      </Flex>
    </HomeDashboardSection>
  </div>
</template>
