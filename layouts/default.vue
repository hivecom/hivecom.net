<script setup lang="ts">
import { Avatar, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'

const supabase = useSupabaseClient()

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}
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
          <DropdownTitle>
            Username
          </DropdownTitle>
          <DropdownItem icon="ph:sign-out" @click="signOut">
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  </header>
  <main>
    <slot />
  </main>
  <footer>
    <div class="established-text">
      HIVECOM | EST. IN 2013
    </div>
  </footer>
</template>

<style lang="css" scoped>
main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  margin-right: auto;
  max-width: 1200px;
  min-height: 100vh;
}

footer {
  text-align: center;
  margin-top: 3rem;
  padding-bottom: 3rem;

  p {
    font-size: 1.5rem;
    font-style: italic;
    margin-bottom: 0.5rem;
  }

  .established-text {
    font-size: 0.8rem;
    letter-spacing: 1px;
    opacity: 0.7;
  }
}
</style>
