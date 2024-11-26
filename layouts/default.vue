<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'

// const supabase = useSupabaseClient()

// async function signOut() {
//   await supabase.auth.signOut()
//   navigateTo('/login')
// }
</script>

<template>
  <header class="header">
    <div class="container">
      <NuxtImg src="/logo.svg" width="136" />
      <ul>
        <li>
          <NuxtLink to="/home">
            Home
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/events">
            Events
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/votes">
            Votes
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/community">
            Community
          </NuxtLink>
        </li>
      </ul>
    </div>
    <!-- <Flex space-between>
      <h3>HIVECOM</h3>
      <div>
        <Button square icon="ph:sign-out" @click="signOut">
          Sign Out
        </Button>
      </div>
    </Flex> -->
  </header>
  <div class="container">
    <slot />
  </div>
</template>
