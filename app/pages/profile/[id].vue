<script setup lang="ts">
import ProfileDetail from '@/components/Profile/ProfileDetail.vue'

const route = useRoute()
const identifier = route.params.id as string

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isUuid = uuidRegex.test(identifier)
const userId = isUuid ? identifier : undefined
const username = !isUuid ? identifier : undefined

defineOgImage('Profile', {
  userId,
  username,
})
</script>

<template>
  <div class="page">
    <ProfileDetail
      :user-id="userId"
      :username="username"
    />
  </div>
</template>
