<script setup lang="ts">
import { Avatar } from '@dolanske/vui'
import { computed } from 'vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

const props = withDefaults(defineProps<{
  userId?: string | null
  size?: 's' | 'm' | 'l' | number
}>(), {
  size: 'm',
})

const userIdRef = computed(() => props.userId ?? null)

const { user } = useCacheUserData(userIdRef, {
  includeAvatar: true,
  includeRole: false,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})
</script>

<template>
  <Avatar
    :size="props.size"
    :url="user?.avatarUrl ?? undefined"
  />
</template>
