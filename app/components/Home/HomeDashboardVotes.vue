<script setup lang="ts">
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import { useDataVotes } from '@/composables/useDataVotes'

dayjs.extend(relativeTime)

// Raw data pass for the Votes card: active referendums I haven't voted in,
// then the latest concluded ones with their turnout.

const {
  activePublicItems,
  concludedPublicItems,
  fetchConcludedPublicPage,
  fetchUserVotedIds,
  fetchVoteCounts,
  getVoteCount,
  hasVoted,
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

const needsDeciding = computed(() => activePublicItems.value.filter(r => !hasVoted(r.id)))
const alreadyVoted = computed(() => activePublicItems.value.filter(r => hasVoted(r.id)))
const latestConcluded = computed(() => concludedPublicItems.value.slice(0, 3))
</script>

<template>
  <div>
    <HomeDashboardSection label="Needs deciding">
      <ul v-if="needsDeciding.length">
        <li v-for="r in needsDeciding" :key="r.id">
          <NuxtLink to="/votes">
            <strong>{{ r.title }}</strong>
          </NuxtLink>
          - ends {{ dayjs(r.date_end).fromNow() }}, {{ getVoteCount(r.id) }} votes so far
        </li>
      </ul>
      <p v-else>
        Nothing waiting on your vote.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="You voted, still running">
      <ul v-if="alreadyVoted.length">
        <li v-for="r in alreadyVoted" :key="r.id">
          {{ r.title }} - ends {{ dayjs(r.date_end).fromNow() }}, {{ getVoteCount(r.id) }} votes
        </li>
      </ul>
      <p v-else>
        No active votes you took part in.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Latest results">
      <ul v-if="latestConcluded.length">
        <li v-for="r in latestConcluded" :key="r.id">
          {{ r.title }} - concluded {{ dayjs(r.date_end).fromNow() }}, {{ getVoteCount(r.id) }} votes
        </li>
      </ul>
      <p v-else>
        No concluded votes.
      </p>
    </HomeDashboardSection>
  </div>
</template>
