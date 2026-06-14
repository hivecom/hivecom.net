<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Kbd, KbdGroup, Sheet, Sidebar, Spinner, Tooltip } from '@dolanske/vui'
import { until, useMediaQuery } from '@vueuse/core'
import SharedLogo from '@/components/Shared/Logo.vue'
import LogoIcon from '@/components/Shared/LogoIcon.vue'
import ThemeToggle from '@/components/Shared/ThemeToggle.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { useRoleImpersonation } from '@/composables/useRoleImpersonation'
import { useBreakpoint } from '@/lib/mediaQuery'

const route = useRoute()
const { openCommand } = useCommand()
const isMac = import.meta.client && /Mac/i.test(navigator.platform)
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()
// resolvedUserId is just userId — we wait for useSupabaseUser() to populate
// before running the auth check, so no sessionUserId fallback is needed.
const resolvedUserId = userId

// Initialize user role and permissions from database
const userPermissions = ref<string[]>([])
const realPermissions = ref<string[]>([])

const { impersonatedRole, isImpersonating, resolvePermissions, stop: stopImpersonation } = useRoleImpersonation()

// When impersonation changes, swap the injected permissions
watch(impersonatedRole, async (role) => {
  if (role) {
    userPermissions.value = await resolvePermissions(role)
  }
  else {
    userPermissions.value = [...realPermissions.value]
  }
})
const isLoading = ref(true)
const isAuthorized = ref(false)

// Use cached user data to avoid a raw user_roles query on every admin page mount
const { user: cachedUserData } = useDataUser(resolvedUserId, { includeRole: true, includeAvatar: false })
const userRole = computed(() => cachedUserData.value?.role ?? null)
const { role: effectiveUserRole } = useEffectiveRole()

defineOgImage('Default', {
  title: 'Hivecom',
  description: 'A worldwide community of friends building projects together.',
})

const isBelowExtraLarge = useBreakpoint('<xl')

// Check user role and permissions, redirect if not authorized.
// Role is read from useDataUser (shared with UserDropdown etc.) so no extra query fires.
onMounted(async () => {
  try {
    // On a cold SPA load, useSupabaseUser() starts null and is only populated once
    // the INITIAL_SESSION auth state event fires. We must wait for it before
    // proceeding - if we trigger useDataUser's fetch while currentUser is still null,
    // fetchRole() will bail out early to avoid caching a null role for unauthenticated
    // requests. That causes role to come back null and the layout to incorrectly
    // redirect an authenticated admin to home.
    if (!user.value) {
      await until(user).toMatch(u => u !== null, { timeout: 5000 }).catch(() => null)
    }

    const targetUserId = userId.value

    if (!targetUserId) {
      await navigateTo('/')
      return
    }

    // Wait for cachedUserData to populate. Now that useSupabaseUser() is set,
    // fetchRole() will actually query the database instead of short-circuiting.
    // If the role is already cached this resolves synchronously via the computed.
    await until(cachedUserData).toMatch(d => d !== null, { timeout: 8000 }).catch(() => null)

    const role = userRole.value
    const hasRequiredRole = role === 'admin' || role === 'moderator'

    if (!hasRequiredRole) {
      await navigateTo('/')
      return
    }

    // Fetch role permissions from role_permissions table
    const { data: permissionsData, error: permissionsError } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role', role as 'admin' | 'moderator')

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError)
    }
    else {
      realPermissions.value = permissionsData?.map(p => p.permission) ?? []
      // If already impersonating when the layout mounts, apply the impersonated
      // permissions immediately - the watch won't fire for a pre-existing value.
      if (impersonatedRole.value) {
        userPermissions.value = await resolvePermissions(impersonatedRole.value)
      }
      else {
        userPermissions.value = [...realPermissions.value]
      }
    }

    isAuthorized.value = true
  }
  catch (error) {
    console.error('Error in admin layout:', error)
    await navigateTo('/')
  }
  finally {
    isLoading.value = false
  }
})

// Watch for user changes (login/logout)
watch(user, async (newUser) => {
  if (!newUser) {
    // User logged out, redirect to landing page
    isAuthorized.value = false
    await navigateTo('/')
  }
})

// Helper function to check if user has specific permission
function hasPermission(permission: string): boolean {
  return userPermissions.value.includes(permission)
}

// Helper function to check if user has any of the provided permissions
function hasAnyPermission(permissions: string[]): boolean {
  return permissions.some(permission => userPermissions.value.includes(permission))
}

// Menu items with their required permissions
const menuItems = [
  {
    name: 'Dashboard',
    path: '/admin/',
    icon: 'ph:squares-four',
    permissions: [], // Dashboard is always accessible to admin/moderator
    dividerAfter: false,
  },
  {
    name: 'Metrics',
    path: '/admin/metrics',
    icon: 'ph:chart-bar',
    permissions: [],
    dividerAfter: true,
  },
  {
    name: 'Assets',
    path: '/admin/assets',
    icon: 'ph:images-square',
    permissions: ['assets.read', 'assets.create', 'assets.update', 'assets.delete'],
  },
  {
    name: 'Complaints',
    path: '/admin/complaints',
    icon: 'ph:flag',
    permissions: ['complaints.read', 'complaints.create', 'complaints.update', 'complaints.delete'],
  },
  {
    name: 'Discussions',
    path: '/admin/discussions',
    icon: 'ph:chat-circle',
    permissions: ['discussions.read', 'discussions.create', 'discussions.update', 'discussions.delete'],
  },
  {
    name: 'Events',
    path: '/admin/events',
    icon: 'ph:calendar-blank',
    permissions: ['events.read', 'events.create', 'events.update', 'events.delete'],
  },
  {
    name: 'Funding',
    path: '/admin/funding',
    icon: 'ph:coins',
    permissions: ['funding.read'],
  },
  {
    name: 'Games',
    path: '/admin/games',
    icon: 'ph:game-controller',
    permissions: ['games.read', 'games.create', 'games.update', 'games.delete'],
  },
  {
    name: 'KV Store',
    path: '/admin/kvstore',
    icon: 'ph:database',
    permissions: ['kvstore.read', 'kvstore.create', 'kvstore.update', 'kvstore.delete'],
  },
  {
    name: 'MOTDs',
    path: '/admin/motds',
    icon: 'ph:speaker-simple-high',
    permissions: ['motds.read', 'motds.create', 'motds.update', 'motds.delete'],
  },
  {
    name: 'Network',
    path: '/admin/network',
    icon: 'ph:computer-tower',
    permissions: ['network.read', 'network.create', 'network.update', 'network.delete'],
  },
  {
    name: 'Projects',
    path: '/admin/projects',
    icon: 'ph:folder',
    permissions: ['projects.read', 'projects.create', 'projects.update', 'projects.delete'],
  },
  {
    name: 'Referendums',
    path: '/admin/referendums',
    icon: 'ph:user-sound',
    permissions: ['referendums.read', 'referendums.create', 'referendums.update', 'referendums.delete'],
  },
  {
    name: 'Themes',
    path: '/admin/themes',
    icon: 'ph:paint-brush',
    permissions: ['themes.read', 'themes.create', 'themes.update', 'themes.delete'],
  },
  {
    name: 'Users & Roles',
    path: '/admin/users',
    icon: 'ph:user',
    permissions: ['users.read', 'users.create', 'users.update', 'users.delete', 'profiles.read', 'profiles.update', 'profiles.delete'],
  },
]

// Filter menu items based on user permissions
const accessibleMenuItems = computed(() => {
  return menuItems.filter((item) => {
    // If no permissions required, always show (like Dashboard)
    if (item.permissions.length === 0)
      return true

    // Check if user has any of the required permissions for this menu item
    return hasAnyPermission(item.permissions)
  })
})

// Provide permissions to child components
provide('userPermissions', readonly(userPermissions))
provide('userRole', readonly(effectiveUserRole))
provide('hasPermission', hasPermission)
provide('hasAnyPermission', hasAnyPermission)
provide('impersonatedRole', readonly(impersonatedRole))
provide('isImpersonating', readonly(isImpersonating))
provide('stopImpersonation', stopImpersonation)

const { settings } = useDataUserSettings()
const miniSidebar = computed({
  get: () => settings.value.admin_mini_sidebar,
  set: (v: boolean) => { settings.value.admin_mini_sidebar = v },
})
const expandedLayout = computed({
  get: () => settings.value.admin_expanded_layout,
  set: (v: boolean) => { settings.value.admin_expanded_layout = v },
})

const adminTablePerPage = computed(() => {
  return expandedLayout.value ? 20 : 10
})

provide('adminTablePerPage', adminTablePerPage)

const expandedContentStyle = {
  width: '100%',
  paddingLeft: 'var(--space-m)',
  paddingRight: 'var(--space-m)',
} as const

const expandToggleLabel = computed(() => {
  return expandedLayout.value ? 'Narrow View' : 'Widen View'
})

const expandToggleIcon = computed(() => {
  return expandedLayout.value ? 'ph:arrows-in-line-horizontal' : 'ph:arrows-out-line-horizontal'
})

const open = ref(true)
const isMobile = useMediaQuery('(max-width: 1024px)')
const mobileNavOpen = ref(false)

function handleNavigation(path: string) {
  mobileNavOpen.value = false
  return navigateTo(path)
}

watch(isMobile, (nowMobile) => {
  if (!nowMobile)
    mobileNavOpen.value = false
})

watch(() => route.path, () => {
  if (isMobile.value)
    mobileNavOpen.value = false
})
</script>

<template>
  <!-- Show loading spinner while checking authorization -->
  <div v-if="isLoading" class="admin-layout__loading">
    <Spinner />
  </div>

  <!-- Show admin layout only if authorized -->
  <div v-else-if="isAuthorized" class="admin-layout vui-sidebar-layout">
    <div v-if="isMobile" class="admin-layout__mobile-bar">
      <div class="admin-layout__mobile-bar-items">
        <div class="admin-layout__mobile-left-group">
          <Button square aria-label="Open admin navigation" @click="mobileNavOpen = true">
            <Icon name="ph:list" size="2rem" />
          </Button>
          <Button square plain aria-label="Search" class="pl-4 vui-button-accent-weak vui-button-rounded" @click="openCommand()">
            <Icon name="ph:magnifying-glass" size="20" />
          </Button>
        </div>

        <SharedLogo class="admin-layout__mobile-logo" />

        <div class="admin-layout__mobile-right-group" />
      </div>

      <Sheet
        class="admin-layout__mobile-sheet"
        :open="mobileNavOpen"
        position="left"
        :card="{ separators: true }"
        @close="mobileNavOpen = false"
      >
        <template #header>
          <Flex x-between style="padding-top:3px">
            <SharedLogo class="admin-layout__sheet-logo" />
          </Flex>
        </template>
        <template #header-end />

        <div class="admin-layout__mobile-menu">
          <template
            v-for="item in accessibleMenuItems"
            :key="item.path"
          >
            <NuxtLink
              :to="item.path"
              class="admin-layout__mobile-menu-item"
              :class="{ 'router-link-active': route.path === item.path }"
              @click.prevent="handleNavigation(item.path)"
            >
              <Icon v-if="item.icon" :name="item.icon" />
              {{ item.name }}
            </NuxtLink>
            <Divider v-if="item.dividerAfter" class="my-xs" />
          </template>
        </div>

        <template #footer>
          <Flex x-between y-center>
            <NuxtLink to="/">
              <Button expand outline>
                <template #start>
                  <Icon name="ph:caret-left" />
                </template>
                Return to home
              </Button>
            </NuxtLink>
            <ThemeToggle no-text small button />
          </Flex>
        </template>
      </Sheet>
    </div>

    <div v-else class="admin-layout__sidebar-wrapper">
      <ClientOnly>
        <Sidebar v-model="open" :mini="miniSidebar" class="admin-layout__sidebar">
          <template #header>
            <Flex y-center class="sidebar-header">
              <Flex y-center gap="s" expand>
                <LogoIcon />
              </Flex>
              <Flex gap="xxs">
                <Tooltip placement="bottom">
                  <Button square plain aria-label="Search" @click="openCommand()">
                    <Icon name="ph:magnifying-glass" />
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
                <Tooltip placement="bottom">
                  <Button v-if="!isBelowExtraLarge" square plain :aria-label="expandToggleLabel" @click="expandedLayout = !expandedLayout">
                    <Icon :name="expandToggleIcon" />
                  </Button>
                  <template #tooltip>
                    <p>{{ expandToggleLabel }}</p>
                  </template>
                </Tooltip>
                <Tooltip v-if="!miniSidebar" placement="bottom">
                  <Button square plain @click="miniSidebar = !miniSidebar">
                    <Icon name="tabler:layout-sidebar-left-collapse" />
                  </Button>
                  <template #tooltip>
                    <p>Collapse sidebar</p>
                  </template>
                </Tooltip>
              </Flex>
            </Flex>
            <Divider />
          </template>

          <!-- Only show menu items the user has permissions for -->
          <template
            v-for="item in accessibleMenuItems"
            :key="item.path"
          >
            <Tooltip
              :disabled="!miniSidebar"
              placement="right"
            >
              <NuxtLink :to="item.path" class="admin-layout__mobile-nav-link" @click.prevent="handleNavigation(item.path)">
                <DropdownItem
                  :class="{ selected: route.path === item.path }"
                >
                  <template v-if="item.icon" #icon>
                    <Icon :name="item.icon" />
                  </template>
                  {{ item.name }}
                </DropdownItem>
              </NuxtLink>
              <template #tooltip>
                <p>{{ item.name }}</p>
              </template>
            </Tooltip>
            <Divider v-if="item.dividerAfter" class="my-xs" />
          </template>

          <template v-if="miniSidebar">
            <Divider class="my-m" />
            <Tooltip placement="right">
              <DropdownItem square aria-label="Search" @click="openCommand()">
                <template #icon>
                  <Icon name="ph:magnifying-glass" />
                </template>
              </DropdownItem>
              <template #tooltip>
                <p>Search</p>
              </template>
            </Tooltip>
            <Tooltip placement="right">
              <DropdownItem square @click="miniSidebar = !miniSidebar">
                <template #icon>
                  <Icon name="tabler:layout-sidebar-left-expand" />
                </template>
              </DropdownItem>
              <template #tooltip>
                <p>Expand sidebar</p>
              </template>
            </Tooltip>
            <Tooltip v-if="!isBelowExtraLarge" placement="right">
              <DropdownItem square :aria-label="expandToggleLabel" @click="expandedLayout = !expandedLayout">
                <template #icon>
                  <Icon :name="expandToggleIcon" />
                </template>
              </DropdownItem>
              <template #tooltip>
                {{ expandToggleLabel }}
              </template>
            </Tooltip>
          </template>

          <template #footer>
            <Divider />
            <div class="sidebar-footer">
              <Flex v-if="miniSidebar" column x-center y-center gap="m">
                <ThemeToggle no-text button />

                <Tooltip placement="right">
                  <DropdownItem square aria-label="Close admin console" @click="navigateTo('/')">
                    <template #icon>
                      <Icon name="ph:caret-left" />
                    </template>
                  </DropdownItem>
                  <template #tooltip>
                    <p>Close admin console</p>
                  </template>
                </Tooltip>
              </Flex>
              <Flex v-else x-between y-center gap="xs">
                <NuxtLink to="/" class="w-100">
                  <Button size="m" outline expand>
                    <template #start>
                      <Icon name="ph:caret-left" />
                    </template>
                    Return to home
                  </Button>
                </NuxtLink>
                <ThemeToggle no-text button />
              </Flex>
            </div>
          </template>
        </Sidebar>
      </ClientOnly>
    </div>
    <main class="admin-layout__content">
      <div
        class="admin-layout__page-inner pt-xl pb-l"
        :class="!expandedLayout ? 'container-l' : null"
        :style="expandedLayout ? expandedContentStyle : undefined"
      >
        <ClientOnly>
          <slot />

          <template #fallback>
            <Spinner />
          </template>
        </ClientOnly>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.admin-layout {
  min-height: 100vh;
  display: flex;
  position: relative;

  &__mobile-nav-link {
    display: block;
    color: inherit;
    text-decoration: none;
  }
}

:global(.admin-layout__mobile-sheet .vui-card-header) {
  min-height: 64px;
}

.admin-layout {
  &__mobile-menu {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
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
    color: var(--color-text);
    text-decoration: none;

    &:hover,
    &.router-link-active {
      background-color: color-mix(in srgb, var(--color-accent) 10%, transparent);
      color: var(--color-accent);
    }

    .iconify {
      font-size: 18px;
      margin-right: var(--space-xs);
    }
  }

  &__mobile-bar {
    display: none;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: var(--z-nav);
    background-color: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
  }

  &__mobile-bar-items {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 64px;
    padding: 0 var(--space-m);
    position: relative;
  }

  &__mobile-left-group {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    z-index: 1;
  }

  &__mobile-logo {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  &__mobile-right-group {
    // placeholder to balance left group for centering
    display: flex;
  }

  &__sheet-logo {
    :deep(.logo--full) {
      display: block !important;
    }

    :deep(.logo--compact) {
      display: none !important;
    }
  }

  &__mobile-title {
    margin: 0;
  }

  &__loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
  }

  &__sidebar-wrapper {
    position: sticky;
    top: 0;
    align-self: flex-start;
    height: 100vh;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
  }

  &__sidebar {
    height: 100%;

    :deep(.vui-sidebar) {
      background-color: var(--color-bg-medium);
    }

    :deep(.vui-sidebar-header) {
      padding: 0;

      .sidebar-header {
        padding: var(--space-m);
      }
    }

    :deep(.vui-sidebar-footer) {
      padding: 0;

      .sidebar-footer {
        padding: var(--space-m);
      }
    }

    :deep(.vui-card-header) {
      padding-left: var(--space-m);
      padding-right: var(--space-m);
    }
  }

  &__content {
    flex: 1;
    height: 100vh;
    overflow-y: auto;
  }

  &__page-inner {
    position: relative;
  }
}

@media (max-width: $breakpoint-m) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-layout__sidebar-wrapper {
    display: none;
  }

  .admin-layout__content {
    height: auto;
    min-height: 100vh;
    overflow-y: visible;
  }

  .admin-layout__mobile-bar {
    display: block;
  }
}
</style>
