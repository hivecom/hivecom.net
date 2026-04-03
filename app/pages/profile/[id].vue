<script setup lang="ts">
import ProfileDetail from '@/components/Profile/ProfileDetail.vue'

const route = useRoute()
const identifier = route.params.id as string

// UUID regex pattern to detect if the identifier is a UUID
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isUuid = uuidRegex.test(identifier)
const userId = isUuid ? identifier : undefined
const username = !isUuid ? identifier : undefined

// This is extremelly funny
watchEffect(() => {
  if (username === 'zealsprince' && typeof window !== 'undefined') {
    console.log('%c' + 'Piss yourself', 'color: #7289DA; -webkit-text-stroke: 2px black; font-size: 72px; font-weight: bold;')
  }
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
