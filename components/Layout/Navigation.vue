<script setup lang="ts">
import { Avatar, Button, Dropdown, DropdownItem, DropdownTitle, Sheet } from '@dolanske/vui'

import '@/assets/elements/nav.scss'

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

const nickname = ref('')
onMounted(async () => {
  if (!user.value)
    return

  const requestProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.value.id)
    .single()

  nickname.value = requestProfile.data?.nickname || ''
})
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
          <div class="flex x-between" style="padding-top:3px">
            <Button square @click="mobileMenuOpen = false">
              <Icon name="ph:x" />
            </Button>
            <SharedLogo />
            <span />
          </div>
        </template>
        <template #header-end />
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
          <DropdownTitle>
            <NuxtLink to="/profile">
              {{ nickname || user?.email }}
            </NuxtLink>
          </DropdownTitle>
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

<style lang="scss" scoped>
nav {
  width: 100%;
  position: fixed;
  background-color: color-mix(in srgb, var(--color-bg-lowered) 60%, transparent);
  backdrop-filter: blur(16px);

  z-index: 1; // Make sure the nav is main content

  .nav-items {
    margin-left: auto;
    margin-right: auto;

    padding: 0 var(--space-m);
    max-width: var(--container-l);
    display: flex;
    justify-content: flex-start;
    height: 64px;
    gap: 90px;
    align-items: center;

    position: relative;
  }

  .nav-hamburger {
    display: none;
    cursor: pointer;
    font-size: 24px;
    color: var(--color-text);
  }

  .nav-logo {
    img {
      width: 100%;
    }

    &:before {
      content: '';
      position: absolute;
      left: -300px;
      top: -180px;
      width: 769px;
      height: 621px;
      background-image: url(/leak.png);
      background-repeat: no-repeat;
      background-size: contain;
      pointer-events: none;
    }
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    flex: 1;

    li a {
      display: block;
      padding: 0 12px;
      font-size: var(--font-size-m);
      color: var(--color-text);
      text-decoration: none;

      &:hover,
      &.router-link-active {
        color: var(--color-accent);
      }
    }

    .nav-links-separator {
      display: block;
      position: relative;
      width: 1px;
      height: 16px;
      background: var(--color-text);
      opacity: 0.5;
    }
  }

  .nav-auth {
    &-buttons {
      display: flex;
      align-items: center;
      gap: var(--space-s);
    }

    &-mobile-button {
      display: none;
    }
  }

  .nav-user {
    img {
      border-radius: 999px;
    }
  }

  .nav-dropdown {
    position: absolute;
    top: 64px;
    left: 0;
    width: 250px;
    background: var(--color-bg-lowered);
    padding: var(--space-m);
    border-radius: 0 0 var(--border-radius) var(--border-radius);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
    transform: translateY(-10px);
    opacity: 0;
    pointer-events: none;
    transition: all 0.2s ease;

    &.open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: var(--space-s);
    }

    li a {
      display: block;
      padding: var(--space-s);
      font-size: var(--font-size-m);
      color: var(--color-text);

      &:hover,
      &.router-link-active {
        color: var(--color-accent);
      }
    }
  }
}

.nav-mobile-menu {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .nav-mobile-menu-item {
    padding: var(--space-s) var(--space-m);
    display: flex;
    align-items: center;
    justify-content: start;
    width: 100%;
    gap: var(--space-m);
    border-radius: var(--border-radius-s);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;

    &:hover,
    &.router-link-active {
      background-color: color-mix(in srgb, var(--color-accent) 10%, transparent);
      color: var(--color-accent);
    }

    .iconify {
      font-size: 20px;
    }

    &.accent {
      color: var(--color-accent);
      font-weight: 500;

      &:hover {
        background-color: color-mix(in srgb, var(--color-accent) 15%, transparent);
      }
    }
  }

  .nav-mobile-menu-separator {
    display: block;
    height: 1px;
    width: 100%;
    background-color: color-mix(in srgb, var(--color-text) 20%, transparent);
    margin: var(--space-m) 0;
  }
}

@media (max-width: 1080px) {
  nav {
    .nav-items {
      justify-content: space-between;
    }

    .nav-hamburger {
      display: flex;
      align-items: center;
      justify-content: center;
      order: 1;
    }

    .nav-logo {
      order: 2;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }

    .nav-links {
      display: none;
    }

    .nav-auth,
    .nav-user {
      order: 3;
    }

    .nav-auth {
      &-mobile-button {
        display: flex;
      }

      &-buttons {
        display: none;
      }
    }
  }
}
</style>
