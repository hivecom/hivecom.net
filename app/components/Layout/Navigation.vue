<script setup lang="ts">
import { Button, DropdownItem, Flex, Popout, Sheet, Skeleton } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { navigationLinks } from '@/lib/navigation'
import NavEventBadge from './NavEventBadge.vue'
import NotificationDropdown from './NotificationDropdown.vue'
import UserDropdown from './UserDropdown.vue'

// Listen for auth events
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const authReady = ref(false)

const route = useRoute()

const isMobile = useBreakpoint('<s')

// Mobile menu state
const mobileMenuOpen = ref(false)

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

watch(
  () => route.fullPath,
  () => {
    if (mobileMenuOpen.value) {
      closeMobileMenu()
    }
  },
)

// Whether to show status badges in navbar or not
onBeforeMount(async () => {
  await supabase.auth.getSession().catch(() => null)
  authReady.value = true
})

// Track an animated background blob when user is hovering over the navbar links
const navbarLinksRef = useTemplateRef('navbarLinksRef')
const { elementX, isOutside } = useMouseInElement(navbarLinksRef)

const hoveredElement = ref<HTMLElement | null>(null)

const { width, update } = useElementBounding(hoveredElement)

function updateHoveredElement(event: MouseEvent) {
  hoveredElement.value = event.target as HTMLElement | null
  update()
}
</script>

<template>
  <nav class="navigation" :class="{ landing: route.path === '/' }">
    <div class="container container-l">
      <div class="navigation__items">
        <Button square class="navigation__hamburger" aria-label="Open mobile menu" @click="toggleMobileMenu">
          <Icon name="ph:list" size="2rem" />
        </Button>

        <SharedLogo class="navigation__logo" :compact="isMobile" />

        <ul ref="navbarLinksRef" class="navigation__links" @mouseleave="hoveredElement = null">
          <template v-for="link in navigationLinks" :key="link.path">
            <li
              v-if="!link.requiresAuth || (link.requiresAuth && authReady && user)"
              @mouseenter="updateHoveredElement"
            >
              <NuxtLink
                :to="link.path" :class="{
                  'router-link-active': $route.path.includes(link.path) && link.path !== '/',
                  'router-link-focused': !!hoveredElement?.firstElementChild?.textContent.includes(link.label),
                }"
              >
                {{ link.label }}
                <!-- <NavAnnouncementBadge v-if="link.label === 'Announcements'" /> -->
                <NavEventBadge v-if="link.label === 'Events'" />
                <Icon v-if="link.children" name="ph:caret-down-fill" size="12px" />
              </NuxtLink>

              <Popout
                v-if="link.children" placement="bottom-start" class="navigation__links-popout"
                :anchor="hoveredElement"
                :visible="!!hoveredElement?.firstElementChild?.textContent.includes(link.label)"
                :teleport="false"
              >
                <NuxtLink v-for="sublink in link.children" :key="sublink.path" :to="sublink.path">
                  <DropdownItem>
                    {{ sublink.label }}
                  </DropdownItem>
                </NuxtLink>
              </Popout>
            </li>
          </template>

          <ul
            class="navigation__links-hover" :class="{ active: !isOutside }" :style="{
              left: `${elementX}px`,
              width: `${width}px`,
            }"
          />
        </ul>

        <div class="flex-1" />

        <!-- Mobile menu -->
        <Sheet
          class="navigation__mobile-sheet" :open="mobileMenuOpen" position="left" :card="{ separators: true }"
          @close="closeMobileMenu"
        >
          <template #header>
            <Flex x-between style="padding-top:3px">
              <SharedLogo />
            </Flex>
          </template>
          <template #header-end />
          <div class="navigation__mobile-menu">
            <template v-for="link in navigationLinks" :key="link.path">
              <NuxtLink
                v-if="!link.requiresAuth || (link.requiresAuth && authReady && user)" :to="link.path"
                class="navigation__mobile-menu-item"
                :class="{ 'router-link-active': $route.path.includes(link.path) && link.path !== '/' }"
                @click="closeMobileMenu"
              >
                <Icon :name="link.icon" />
                {{ link.label }}
                <NavEventBadge v-if="link.label === 'Events'" />
              </NuxtLink>

              <div class="navigation__mobile-submenu">
                <NuxtLink
                  v-for="sublink in link.children" :key="sublink.path" :to="sublink.path"
                  class="navigation__mobile-menu-item" @click="closeMobileMenu"
                >
                  {{ sublink.label }}
                </NuxtLink>
              </div>
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

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

:deep(.counter) {
  color: var(--color-text-light);
  font-size: var(--font-size-xxs);
}

.navigation {
  width: 100%;
  position: fixed;
  background-color: var(--color-bg);
  z-index: var(--z-nav); // Make sure the nav is main content
  border-bottom: 1px solid var(--color-border);

  &__items {
    display: flex;
    justify-content: flex-start;
    height: 64px;
    gap: 16px;
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

  &__links-popout {
    width: 192px;
    padding: var(--space-xs);
    border-color: var(--color-border);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    box-shadow: none !important;
    transform: translate3D(-8px, -8px, 0);
    background-color: var(--color-bg);

    a {
      padding-inline: 0 !important;
    }

    &:before,
    &:after {
      --size: 16px;

      content: '';
      display: block;
      width: var(--size);
      height: var(--size);
      position: absolute;
      top: 0;
      left: calc(var(--size) * -1);

      aspect-ratio: 1;

      // This is how to make inverted border radius shape with an outline
      background-image: radial-gradient(
        circle at 100% 100%,
        transparent calc(var(--size) - 1px),
        var(--color-border) calc(var(--size) - 1px),
        var(--color-border) var(--size),
        var(--color-bg) var(--size)
      );
    }

    &:before {
      transform: scaleX(-1);
    }

    &:after {
      left: unset;
      right: calc(var(--size) * -1);
    }
  }

  &__links {
    display: flex;
    align-items: center;
    position: relative;
    height: 100%;
    padding-inline: 32px;
    z-index: 1;

    li {
      height: 100%;

      a {
        display: flex;
        align-items: center;
        padding: 0 12px;
        gap: 4px;
        height: 100%;
        font-size: 1.4rem;
        color: var(--color-text-lighter);
        text-decoration: none;
        transition: var(--transition);

        .iconify {
          color: var(--color-text-lighter);
          transition: var(--transition);
          transition-property: color;
        }

        &.router-link-active {
          color: var(--color-accent);

          .iconify {
            color: var(--color-accent);
          }
        }

        &:not(&.router-link-active) {
          &.router-link-focused,
          &:hover {
            color: var(--color-text);

            .iconify {
              color: var(--color-text);
            }
          }
        }

        &.router-link-focused,
        &:hover {
          .iconify {
            transform: rotate(180deg);
          }
        }
      }
    }
  }

  &__links-hover {
    display: block;
    border-radius: 990px;
    position: absolute;
    height: 32px;
    top: 50%;
    left: 0;
    transform: translate3D(-50%, -50%, 0);
    background-color: var(--color-bg-accent-lowered);
    will-change: left, width;
    z-index: -1;
    opacity: 0;
    transition:
      0.2s opacity ease-in-out,
      0.6s width cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;

    &.active {
      opacity: 0.4;
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
    gap: var(--space-s);
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
    gap: var(--space-xxs);
  }

  &__mobile-submenu {
    padding-left: 46px;

    .navigation__mobile-menu-item {
      position: relative;

      &:not(:first-child):after {
        height: 40px;
      }

      &:before {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        left: -20px;
        top: 0px;
        border: 2px solid var(--color-border);
        clip-path: inset(8px 8px 0 0);
        border-radius: 999px;
      }

      &:after {
        content: '';
        position: absolute;
        border-left: 2px solid var(--color-border);
        left: -20px;
        bottom: 30px;
        height: 18px;
      }
    }
  }

  &__mobile-menu-item {
    padding: var(--space-s) var(--space-m);
    display: flex;
    align-items: center;
    justify-content: start;
    width: 100%;
    gap: var(--space-xs);
    border-radius: var(--border-radius-s);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--font-size-m);

    &:hover,
    &.router-link-active {
      background-color: color-mix(in srgb, var(--color-accent) 10%, transparent);
      color: var(--color-accent);
    }

    .iconify {
      font-size: 18px;
      margin-right: var(--space-xs);
    }

    &--accent {
      color: var(--color-accent);
      font-weight: var(--font-weight-medium);

      &:hover {
        background-color: color-mix(in srgb, var(--color-accent) 15%, transparent);
      }
    }
  }
}

@media (max-width: $breakpoint-l) {
  .navigation {
    &__items {
      justify-content: space-between;

      .flex-1 {
        display: none;
      }
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

@media screen and (max-width: $breakpoint-vui-mobile) {
  .navigation {
    &__mobile-menu {
      gap: var(--space-xs);
    }
  }

  .navigation__mobile-submenu .navigation__mobile-menu-item {
    &:before,
    &:after {
      left: -26px;
    }

    &:before {
      top: -8px;
    }

    &:not(:first-child):after {
      height: 40px;
    }

    &:after {
      height: 10px;
    }
  }
}
</style>
