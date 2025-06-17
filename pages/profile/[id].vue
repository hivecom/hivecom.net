<script setup lang="ts">
import ProfileView from '~/components/Profile/ProfileView.vue'

const route = useRoute()
const identifier = route.params.id as string

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Determine if the identifier is a UUID or username
const isUuid = uuidRegex.test(identifier)
const userId = isUuid ? identifier : undefined
const username = !isUuid ? identifier : undefined
</script>

<template>
  <div class="page">
    <ProfileView
      :user-id="userId"
      :username="username"
    />
  </div>
</template>
