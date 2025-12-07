<script setup lang="ts">
import { Button, Flex, Sheet, Skeleton } from '@dolanske/vui'

import NotificationDropdown from './NotificationDropdown.vue'
import UserDropdown from './UserDropdown.vue'

// Listen for auth events
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const authReady = ref(false)

// Mobile menu state
const mobileMenuOpen = ref(false)

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

onMounted(async () => {
  await supabase.auth.getSession().catch(() => null)
  authReady.value = true
})
</script>

<template>
  <nav class="navigation">
    <div class="container container-l">
      <div class="navigation__items">
        <Button class="navigation__hamburger" aria-label="Open mobile menu" @click="toggleMobileMenu">
          <Icon name="ph:list" />
        </Button>

        <SharedLogo class="navigation__logo" />

        <ul class="navigation__links">
          <li>
            <NuxtLink to="/">
              Home
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/announcements">
              Announcements
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/community">
              Community
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/events" :class="{ 'router-link-active': $route.path.includes('/events') }">
              Events
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/gameservers">
              Game Servers
            </NuxtLink>
          </li>
          <template v-if="authReady && user">
            <span class="navigation__links-separator" />
            <li>
              <NuxtLink to="/votes">
                Votes
              </NuxtLink>
            </li>
          </template>
        </ul>

        <!-- Mobile menu -->
        <Sheet
          class="navigation__mobile-sheet"
          :open="mobileMenuOpen"
          position="left"
          separator
          @close="mobileMenuOpen = false"
        >
          <template #header>
            <Flex x-between style="padding-top:3px">
              <SharedLogo />
            </Flex>
          </template>
          <template #header-end />
          <div class="navigation__mobile-menu">
            <NuxtLink to="/" class="navigation__mobile-menu-item" @click="mobileMenuOpen = false">
              <Icon name="ph:house" />
              <span>Home</span>
            </NuxtLink>
            <NuxtLink to="/announcements" class="navigation__mobile-menu-item" @click="mobileMenuOpen = false">
              <Icon name="ph:megaphone" />
              <span>Announcements</span>
            </NuxtLink>
            <NuxtLink to="/community" class="navigation__mobile-menu-item" @click="mobileMenuOpen = false">
              <Icon name="ph:users" />
              <span>Community</span>
            </NuxtLink>
            <NuxtLink to="/events" class="navigation__mobile-menu-item" @click="mobileMenuOpen = false">
              <Icon name="ph:calendar" />
              <span>Events</span>
            </NuxtLink>
            <NuxtLink to="/gameservers" class="navigation__mobile-menu-item" @click="mobileMenuOpen = false">
              <Icon name="ph:game-controller" />
              <span>Game Servers</span>
            </NuxtLink>
            <template v-if="authReady && user">
              <span class="navigation__mobile-menu-separator" />
              <NuxtLink to="/votes" class="navigation__mobile-menu-item" @click="mobileMenuOpen = false">
                <Icon name="ph:check-square" />
                <span>Votes</span>
              </NuxtLink>
            </template>
          </div>
        </Sheet>

        <!-- User dropdown on right side -->
        <div v-if="!authReady" class="navigation__auth navigation__auth--loading">
          <div class="navigation__auth-buttons">
            <Skeleton :height="36" :width="76" :radius="8" />
            <Skeleton :height="36" :width="92" :radius="8" />
          </div>
          <div class="navigation__auth-mobile-button">
            <Skeleton :height="44" :width="44" :radius="12" />
          </div>
        </div>

        <div v-else-if="user" class="navigation__user">
          <NotificationDropdown />
          <UserDropdown />
        </div>

        <div v-else class="navigation__auth">
          <div class="navigation__auth-buttons">
            <Button plain @click="$router.push('/auth/sign-in')">
              Sign in
            </Button>

            <Button variant="accent" @click="$router.push('/auth/sign-up')">
              Sign up
            </Button>
          </div>

          <!-- On mobile we just have a little user icon -->
          <div class="navigation__auth-mobile-button">
            <Button square aria-label="Sign in" @click="$router.push('/auth/sign-in')">
              <Icon name="ph:sign-in" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.navigation {
  width: 100%;
  position: fixed;
  background-color: color-mix(in srgb, var(--color-bg-lowered) 60%, transparent);
  backdrop-filter: blur(16px);
  z-index: var(--z-nav); // Make sure the nav is main content

  &__items {
    display: flex;
    justify-content: flex-start;
    height: 64px;
    gap: 90px;
    align-items: center;
    position: relative;
  }

  &__hamburger {
    display: none;
    cursor: pointer;
    font-size: 24px;
    color: var(--color-text);
  }

  &__logo {
    img {
      width: 100%;
    }
  }

  &__links {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
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
  }

  &__links-separator {
    display: block;
    position: relative;
    width: 1px;
    height: 16px;
    background: var(--color-text);
    opacity: 0.5;
  }

  &__mobile-sheet {
    :deep(.vui-card-header > button) {
      display: none !important;
    }

    :deep(.vui-card-header > button.navigation__mobile-close) {
      display: inline-flex !important;
    }
  }

  &__auth {
    &-buttons {
      display: flex;
      align-items: center;
      gap: var(--space-s);
    }

    &-mobile-button {
      display: none;
    }

    &--loading {
      .navigation__auth-buttons,
      .navigation__auth-mobile-button {
        align-items: center;
      }
    }
  }

  &__user {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  &__dropdown {
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

    &--open {
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

  &__mobile-menu {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__mobile-menu-item {
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

    &--accent {
      color: var(--color-accent);
      font-weight: var(--font-weight-medium);

      &:hover {
        background-color: color-mix(in srgb, var(--color-accent) 15%, transparent);
      }
    }
  }

  &__mobile-menu-separator {
    display: block;
    height: 1px;
    width: 100%;
    background-color: color-mix(in srgb, var(--color-text) 20%, transparent);
    margin: var(--space-m) 0;
  }
}

@media (max-width: $breakpoint-l) {
  .navigation {
    &__items {
      justify-content: space-between;
    }

    &__hamburger {
      display: flex;
      align-items: center;
      justify-content: center;
      order: 1;
    }

    &__logo {
      order: 2;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }

    &__links {
      display: none;
    }

    &__auth,
    &__user {
      order: 3;
    }

    &__auth {
      &-buttons {
        display: none;
      }

      &-mobile-button {
        display: flex;
      }
    }
  }
}
</style>
