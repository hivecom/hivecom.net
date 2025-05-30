<script setup lang="ts">
import ProfileView from '~/components/Profile/ProfileView.vue'

const route = useRoute()
const user = useSupabaseUser()
const id = route.params.id as string

// Check if viewing own profile
const isOwnProfile = computed(() => user.value?.id === id)
</script>

<template>
  <div class="page">
    <ProfileView :user-id="id" :is-own-profile="isOwnProfile" />
  </div>
</template>
