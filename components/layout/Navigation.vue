<script setup lang="ts">
import { Avatar, Button, Dropdown, DropdownItem, DropdownTitle, Sheet } from '@dolanske/vui'
import { Icon } from '@iconify/vue'

const supabase = useSupabaseClient()

// Listen for auth events and save username
const user = useSupabaseUser()

// Mobile menu state
const mobileMenuOpen = ref(false)

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/auth/sign-in')
}
</script>

<template>
  <nav>
    <div class="nav-items">
      <div class="nav-hamburger" @click="toggleMobileMenu">
        <Icon v-if="!mobileMenuOpen" class="iconify" icon="ph:list" />
        <Icon v-else class="iconify" icon="ph:x" />
      </div>

      <NuxtLink to="/" class="nav-logo">
        <NuxtImg src="/logo.svg" width="136" alt="Hivecom" />
      </NuxtLink>

      <ul class="nav-links">
        <li>
          <NuxtLink to="/">
            Home
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/community">
            Community
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/events">
            Events
          </NuxtLink>
        </li>
        <li>
          <NuxtLink to="/gameservers">
            Gameservers
          </NuxtLink>
        </li>
        <template v-if="user">
          <span class="nav-links-separator" />
          <li>
            <NuxtLink to="/votes">
              Votes
            </NuxtLink>
          </li>
        </template>
      </ul>

      <!-- Mobile menu -->
      <Sheet v-model="mobileMenuOpen" position="left" separator>
        <template #header>
          <h2>Navigation</h2>
        </template>
        <ul class="nav-links">
          <li>
            <NuxtLink to="/">
              Home
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/community">
              Community
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/events">
              Events
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/gameservers">
              Gameservers
            </NuxtLink>
          </li>
          <template v-if="user">
            <span class="nav-links-separator" />
            <li>
              <NuxtLink to="/votes">
                Votes
              </NuxtLink>
            </li>
          </template>
        </ul>
      </Sheet>

      <div v-if="user" class="nav-user">
        <Dropdown>
          <template #trigger="{ toggle }">
            <button @click="toggle">
              <Avatar src="https://i.imgur.com/65aJ4oG.png" width="32" height="32" alt="Username" />
            </button>
          </template>
          <DropdownTitle>{{ user?.email }}</DropdownTitle>
          <DropdownItem icon="ph:sign-out" @click="signOut">
            Sign out
          </DropdownItem>
          <DropdownItem>
            <SharedThemeToggle />
          </DropdownItem>
        </Dropdown>
      </div>

      <div v-else class="nav-auth">
        <div class="nav-auth-buttons">
          <NuxtLink to="/auth/sign-in">
            <Button>
              Sign in
            </Button>
          </NuxtLink>

          <NuxtLink to="/auth/sign-up">
            <Button variant="accent">
              Sign up
            </Button>
          </NuxtLink>
        </div>
        <div class="nav-auth-mobile-button">
          <NuxtLink to="/auth/sign-in">
            <Button square icon="ph:user" />
          </NuxtLink>
        </div>
      </div>
    </div>
  </nav>
</template>
