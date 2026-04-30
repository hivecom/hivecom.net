<script setup lang="ts">
import { Button, DropdownItem, Flex, Kbd, KbdGroup, Popout, Sheet, Skeleton, Tooltip } from '@dolanske/vui'
import SharedLogo from '@/components/Shared/Logo.vue'
import SharedThemeToggle from '@/components/Shared/ThemeToggle.vue'
import { useCommand } from '@/composables/useCommand'
import { useMfaStatus } from '@/composables/useMfaStatus'
import { navigationLinks } from '@/config/navigation'
import { useBreakpoint } from '@/lib/mediaQuery'
import NavEventBadge from './NavEventBadge.vue'
import NotificationSheet from './NotificationSheet.vue'
import UserDropdown from './UserDropdown.vue'
import UserSheet from './UserSheet.vue'

const { editorActive } = useThemeEditorState()
const { openCommand } = useCommand()

const isMac = import.meta.client && /Mac/i.test(navigator.platform)

const { signInPath } = useAuthRedirect()

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

// Hide user section when MFA challenge is in progress
const mfaCache = useMfaStatus()
const needsMfaChallenge = computed(
  () => mfaCache.value.nextLevel === 'aal2' && mfaCache.value.currentLevel !== 'aal2',
)

const hoveredElement = ref<HTMLElement | null>(null)

function isSublinkActive(sublinkPath: string): boolean {
  const [path, query] = sublinkPath.split('?')
  const sublinkTab = new URLSearchParams(query ?? '').get('tab') ?? 'list'
  const routeTab = (route.query.tab as string | undefined) ?? 'list'
  return route.path === path && routeTab === sublinkTab
}

const { width, update } = useElementBounding(hoveredElement)

function updateHoveredElement(event: MouseEvent) {
  hoveredElement.value = event.target as HTMLElement | null
  update()
}

const [DefineSearchButton, SearchButton] = createReusableTemplate()
</script>

<template>
  <nav
    class="navigation" :class="{ landing: route.path === '/',
                                 editing: editorActive }"
  >
    <DefineSearchButton>
      <Tooltip :disabled="isMobile">
        <Button square plain aria-label="Search" class="vui-button-accent-weak vui-button-rounded" @click="openCommand()">
          <Icon name="ph:list-magnifying-glass" size="20" />
        </Button>
        <template #tooltip>
          <p>
            Search <KbdGroup>
              <Kbd :keys="isMac ? '⌘' : 'Ctrl'" class="mr-xxs" />
              <Kbd keys="K" />
            </KbdGroup>
          </p>
        </template>
      </Tooltip>
    </DefineSearchButton>

    <div class="container-l">
      <div class="navigation__items">
        <div class="navigation__left-group">
          <Button square class="navigation__hamburger" aria-label="Open mobile menu" @click="toggleMobileMenu">
            <Icon name="ph:list" size="2rem" />
          </Button>
          <Button square plain aria-label="Search" class="navigation__mobile-search pl-4 vui-button-accent-weak vui-button-rounded" @click="openCommand()">
            <Icon name="ph:magnifying-glass" size="16" />
          </Button>
        </div>

        <SharedLogo class="navigation__logo" />

        <ul ref="navbarLinksRef" class="navigation__links" @mouseleave="hoveredElement = null">
          <template v-for="link in navigationLinks" :key="link.path">
            <li
              v-if="!link.requiresAuth || (link.requiresAuth && authReady && user)"
              @mouseenter="updateHoveredElement"
            >
              <NuxtLink
                :to="link.path" :class="{
                  'router-link-active': $route.path.startsWith(link.path.split('?')[0] ?? link.path) && link.path !== '/',
                  'router-link-focused': !!hoveredElement?.firstElementChild?.textContent.includes(link.label),
                }"
              >
                {{ link.label }}
                <ClientOnly><NavEventBadge v-if="link.label === 'Events'" /></ClientOnly>
                <Icon v-if="link.children" name="ph:caret-down-fill" size="12px" />
              </NuxtLink>

              <Popout
                v-if="link.children" placement="bottom-start" class="navigation__links-popout"
                :anchor="hoveredElement"
                :visible="!!hoveredElement?.firstElementChild?.textContent.includes(link.label)"
                :teleport="false"
              >
                <a
                  v-for="sublink in link.children" :key="sublink.path" :href="sublink.path"
                  :class="{ 'router-link-active': isSublinkActive(sublink.path) }"
                  @click.prevent="$router.push(sublink.path)"
                >
                  <DropdownItem>
                    {{ sublink.label }}
                  </DropdownItem>
                </a>
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
                active-class=""
                :class="{ 'router-link-active': $route.path.startsWith(link.path.split('?')[0] ?? link.path) && link.path !== '/' }"
                @click="closeMobileMenu"
              >
                <Icon :name="link.icon" />
                {{ link.label }}
                <ClientOnly><NavEventBadge v-if="link.label === 'Events'" /></ClientOnly>
              </NuxtLink>

              <div class="navigation__mobile-submenu">
                <a
                  v-for="sublink in link.children" :key="sublink.path" :href="sublink.path"
                  class="navigation__mobile-menu-item"
                  :class="{ 'router-link-active': isSublinkActive(sublink.path) }"
                  @click.prevent="$router.push(sublink.path); closeMobileMenu()"
                >
                  {{ sublink.label }}
                </a>
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

        <div v-else-if="user && !needsMfaChallenge" class="navigation__user">
          <SearchButton v-if="!isMobile" />
          <!-- Custom margin, since visually the pfp appears closer than the distance between search & notif icons -->
          <NotificationSheet style="margin-right:6px" />
          <UserSheet v-if="isMobile" />
          <UserDropdown v-else />
        </div>

        <div v-else class="navigation__auth">
          <div class="navigation__auth-buttons">
            <SearchButton />

            <SharedThemeToggle button no-text plain accent-weak rounded :disable-tooltip="isMobile" />

            <Tooltip :disabled="isMobile">
              <NuxtLink to="/themes">
                <Button square plain aria-label="Themes" class="vui-button-accent-weak vui-button-rounded">
                  <Icon name="ph:paint-brush" />
                </Button>
              </NuxtLink>
              <template #tooltip>
                <p>Themes</p>
              </template>
            </Tooltip>

            <Button plain @click="$router.push(signInPath())">
              Sign in
            </Button>

            <Button variant="accent" @click="$router.push('/auth/sign-up')">
              Sign up
            </Button>
          </div>

          <!-- On mobile we just have a little user icon -->
          <div class="navigation__auth-mobile-button">
            <SharedThemeToggle button no-text plain accent-weak rounded disable-tooltip />
            <Tooltip :disabled="isMobile">
              <NuxtLink to="/themes">
                <Button square plain aria-label="Themes" class="vui-button-accent-weak vui-button-rounded">
                  <Icon name="ph:paint-brush" />
                </Button>
              </NuxtLink>
              <template #tooltip>
                <p>Themes</p>
              </template>
            </Tooltip>
            <Button square aria-label="Sign in" @click="$router.push(signInPath())">
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
  container-type: inline-size;
  container-name: navigation;

  @media screen and (min-width: $breakpoint-s) {
    &.editing {
      right: var(--editor-width);
      left: 0;
      width: auto;
    }
  }

  &__items {
    display: flex;
    justify-content: flex-start;
    height: 64px;
    gap: 16px;
    align-items: center;
    position: relative;
  }

  &__search {
    .iconify {
      color: var(--color-text-lighter);
    }

    &:hover .iconify {
      color: var(--color-text);
    }
  }

  &__left-group {
    align-items: center;
    gap: var(--space-s);
    display: none;
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
    border-radius: var(--border-radius-pill);
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
        border-radius: var(--border-radius-pill);
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

/* We make a custom breakpoint here simply because the navigation is a bit of an edge case */
@container navigation (max-width: 920px) {
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
    }

    &__left-group {
      display: flex;
      z-index: 1;
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
        gap: var(--space-xs);
      }
    }
  }
}

@container navigation (max-width: #{$breakpoint-vui-mobile}) {
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
