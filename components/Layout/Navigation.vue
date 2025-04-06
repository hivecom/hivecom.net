<script setup lang="ts">
import { Avatar, Button, Dropdown, DropdownItem, DropdownTitle, Sheet } from '@dolanske/vui'

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
      <Button class="nav-hamburger" icon="ph:list" @click="toggleMobileMenu" />

      <SharedLogo class="nav-logo" />

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
          <SharedLogo />
        </template>
        <div class="nav-mobile-menu">
          <NuxtLink to="/" class="nav-mobile-menu-item" @click="mobileMenuOpen = false">
            <Icon name="ph:house" />
            <span>Home</span>
          </NuxtLink>
          <NuxtLink to="/community" class="nav-mobile-menu-item" @click="mobileMenuOpen = false">
            <Icon name="ph:users" />
            <span>Community</span>
          </NuxtLink>
          <NuxtLink to="/events" class="nav-mobile-menu-item" @click="mobileMenuOpen = false">
            <Icon name="ph:calendar" />
            <span>Events</span>
          </NuxtLink>
          <NuxtLink to="/gameservers" class="nav-mobile-menu-item" @click="mobileMenuOpen = false">
            <Icon name="ph:game-controller" />
            <span>Gameservers</span>
          </NuxtLink>
          <template v-if="user">
            <span class="nav-mobile-menu-separator" />
            <NuxtLink to="/votes" class="nav-mobile-menu-item" @click="mobileMenuOpen = false">
              <Icon name="ph:check-square" />
              <span>Votes</span>
            </NuxtLink>
          </template>
        </div>
      </Sheet>

      <!-- User dropdown on right side -->
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

        <!-- On mobile we just have a little user icon -->
        <div class="nav-auth-mobile-button">
          <NuxtLink to="/auth/sign-in">
            <Button square icon="ph:sign-in" />
          </NuxtLink>
        </div>
      </div>
    </div>
  </nav>
</template>
