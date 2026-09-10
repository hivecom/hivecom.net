<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import { useDataVotes } from '@/composables/useDataVotes'
import ReferendumCard from '../Shared/ReferendumCard.vue'

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

const needsDeciding = computed(() => activePublicItems.value.filter(r => !hasVoted(r.id))[0])
const alreadyVoted = computed(() => activePublicItems.value.filter(r => hasVoted(r.id)).slice(0, 2))
const latestConcluded = computed(() => concludedPublicItems.value.slice(0, 3))
</script>

<template>
  <div>
    <HomeDashboardSection v-if="needsDeciding" label="Needs deciding">
      <ReferendumCard :referendum="needsDeciding" :vote-count="getVoteCount(needsDeciding.id)" status="active" compact />
    </HomeDashboardSection>

    <HomeDashboardSection v-if="alreadyVoted.length" label="You voted, still running">
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

    <HomeDashboardSection v-if="latestConcluded.length" label="Latest results">
      <Flex column gap="xs">
        <ReferendumCard
          v-for="r in latestConcluded" :key="r.id"
          :referendum="r"
          :vote-count="getVoteCount(r.id)"
          status="active"
          compact
        />
      </Flex>
    </HomeDashboardSection>
  </div>
</template>
