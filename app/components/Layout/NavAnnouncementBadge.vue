<script setup lang="ts">
import { computed } from 'vue'

const supabase = useSupabaseClient()

const isNewAnnouncement = useState<boolean>('layout:nav:isNewAnnouncement', () => false)

const shouldShow = computed(() => isNewAnnouncement.value)

onMounted(async () => {
  // Only fetch if we don't already know.
  if (isNewAnnouncement.value) {
    return
  }

  const { count } = await supabase
    .from('announcements')
    .select('*', { count: 'exact', head: true })
    .eq('pinned', true)

  isNewAnnouncement.value = !!(count && count > 0)
})
</script>

<template>
  <SharedTinyBadge v-if="shouldShow" variant="neutral">
    New
  </SharedTinyBadge>
</template>
