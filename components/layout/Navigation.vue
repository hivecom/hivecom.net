<script setup lang="ts">
import { Avatar, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'

const supabase = useSupabaseClient()

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

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/auth/sign-in')
}
</script>

<template>
  <nav>
    <div class="nav-items">
      <NuxtImg class="nav-logo" src="/logo.svg" width="136" alt="Hivecom" />
      <ul class="nav-links">
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

      <div class="nav-user">
        <Dropdown>
          <template #trigger="{ toggle }">
            <Button @click="toggle">
              <Avatar src="https://i.imgur.com/65aJ4oG.png" width="32" height="32" alt="Username" />
            </Button>
          </template>
          <DropdownTitle>{{ username }}</DropdownTitle>
          <DropdownItem icon="ph:sign-out" @click="signOut">
            Sign out
          </DropdownItem>
          <DropdownItem>
            <SharedThemeToggle />
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  </nav>
</template>
