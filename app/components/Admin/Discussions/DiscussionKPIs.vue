<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import { computed, onMounted, ref, watch } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()

const discussionsQuery = supabase
  .from('discussions')
  .select(`
    id,
    created_at,
    is_locked,
    is_sticky,
    discussion_topic_id,
    profile_id,
    project_id,
    event_id,
    gameserver_id,
    referendum_id,
    reply_count
  `)

const loading = ref(true)
const errorMessage = ref('')

const discussions = ref<QueryData<typeof discussionsQuery>>([])

const totalDiscussions = computed(() => discussions.value.length)

const totalReplies = computed(() =>
  discussions.value.reduce((count: number, discussion: QueryData<typeof discussionsQuery>[number]) => count + (discussion.reply_count ?? 0), 0),
)

const recentDiscussions = computed(() => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return discussions.value.filter((item: QueryData<typeof discussionsQuery>[number]) => new Date(item.created_at) >= thirtyDaysAgo).length
})

async function fetchDiscussions() {
  try {
    loading.value = true
    errorMessage.value = ''

    const { data, error } = await discussionsQuery

    if (error)
      throw error

    discussions.value = data || []
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load discussion data'
  }
  finally {
    loading.value = false
  }
}

watch(() => refreshSignal.value, () => {
  if (refreshSignal.value > 0) {
    fetchDiscussions()
  }
})

onMounted(fetchDiscussions)
</script>

<template>
  <KPIContainer>
    <KPICard
      label="Total Discussions"
      :value="totalDiscussions"
      :is-loading="loading"
      icon="ph:chat-circle"
      variant="primary"
      description="All discussions across the platform"
    />

    <KPICard
      label="Recent (30d)"
      :value="recentDiscussions"
      :is-loading="loading"
      icon="ph:calendar-check"
      variant="gray"
      description="New discussions in the last 30 days"
    />

    <KPICard
      label="Total Replies"
      :value="totalReplies"
      :is-loading="loading"
      icon="ph:chat-teardrop-dots"
      variant="gray"
      description="Total replies across all discussions"
    />
  </KPIContainer>

  <div v-if="errorMessage" class="text-color-danger text-s">
    {{ errorMessage }}
  </div>
</template>
