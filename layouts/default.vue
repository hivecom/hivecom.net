<script setup lang="ts">
import { Avatar, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'

const supabase = useSupabaseClient()

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}

// Listen for auth events and save username
const username = ref()

supabase.auth.onAuthStateChange((event, session) => {
  switch (event) {
    case 'SIGNED_IN': {
      if (session) {
        username.value = session.user.user_metadata.username ?? session.user.email
      }
      break
    }

    case 'SIGNED_OUT': {
      username.value = 'Not logged in'
      break
    }
  }
})
</script>

<template>
  <header class="header">
    <div class="container">
      <NuxtImg src="/logo.svg" width="136" alt="Hivecom" />
      <ul class="header-links">
        <li>
          <NuxtLink to="/">
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

      <div class="header-user">
        <Dropdown>
          <template #trigger="{ toggle }">
            <button @click="toggle">
              <Avatar src="https://i.imgur.com/65aJ4oG.png" width="32" height="32" alt="Username" />
            </button>
          </template>
          <DropdownTitle>{{ username }}</DropdownTitle>
          <DropdownItem icon="ph:sign-out" @click="signOut">
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  </header>
  <div class="container">
    <slot />
  </div>
</template>
