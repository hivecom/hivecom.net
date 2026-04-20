<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Kbd, KbdGroup, Sheet, Sidebar, Spinner, Tooltip } from '@dolanske/vui'
import { until, useStorage as useLocalStorage, useMediaQuery } from '@vueuse/core'
import LogoIcon from '@/components/Shared/LogoIcon.vue'
import SharedThemeToggle from '@/components/Shared/ThemeToggle.vue'
import { useDataUser } from '@/composables/useDataUser'
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
const isLoading = ref(true)
const isAuthorized = ref(false)

// Use cached user data to avoid a raw user_roles query on every admin page mount
const { user: cachedUserData } = useDataUser(resolvedUserId, { includeRole: true, includeAvatar: false })
const userRole = computed(() => cachedUserData.value?.role ?? null)

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
      userPermissions.value = permissionsData?.map(p => p.permission) ?? []
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
    permissions: ['funding.read', 'funding.create', 'funding.update', 'funding.delete', 'expenses.read', 'expenses.create', 'expenses.update', 'expenses.delete'],
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
    permissions: ['gameservers.read', 'gameservers.create', 'gameservers.update', 'gameservers.delete', 'servers.read', 'servers.create', 'servers.update', 'servers.delete', 'containers.read', 'containers.create', 'containers.update', 'containers.delete'],
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
provide('userRole', readonly(userRole))
provide('hasPermission', hasPermission)
provide('hasAnyPermission', hasAnyPermission)

const miniSidebar = useLocalStorage('admin-sidebar-open', false)
const expandedLayout = useLocalStorage('admin-layout-expanded', false)

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
  return expandedLayout.value ? 'Constrain admin content width' : 'Expand admin content width'
})

const expandToggleIcon = computed(() => {
  return expandedLayout.value ? 'ph:arrows-in' : 'ph:arrows-out'
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
      <Flex x-between y-center expand>
        <Button square aria-label="Open admin navigation" @click="mobileNavOpen = true">
          <Icon name="ph:list" />
        </Button>

        <LogoIcon style="margin-left: -24px" />

        <!-- <Tooltip>
          <Button square plain aria-label="Search" class="vui-button-accent-weak vui-button-rounded" @click="openCommand()">
            <Icon name="ph:magnifying-glass" size="20" />
          </Button>
          <template #tooltip>
            <p>
              Search <KbdGroup>
                <Kbd :keys="isMac ? '⌘' : 'Ctrl'" class="mr-xxs" />
                <Kbd keys="K" />
              </KbdGroup>
            </p>
          </template>
        </Tooltip> -->

        <span />
      </Flex>

      <Sheet
        class="admin-layout__mobile-sheet"
        :open="mobileNavOpen"
        position="left"
        separator
        @close="mobileNavOpen = false"
      >
        <template #header>
          <Flex y-center gap="xs">
            <LogoIcon style="margin-left: 2px" />
            <!-- <h5 class="admin-layout__mobile-title">
              Admin
            </h5> -->
          </Flex>
        </template>
        <template #header-end>
          <Button square plain aria-label="Close navigation" @click="mobileNavOpen = false">
            <Icon name="ph:x" />
          </Button>
        </template>

        <DropdownItem
          v-for="item in accessibleMenuItems"
          :key="item.path"
          :class="{ selected: route.path === item.path }"
          @click="handleNavigation(item.path)"
        >
          <template v-if="item.icon" #icon>
            <Icon :name="item.icon" />
          </template>
          {{ item.name }}
        </DropdownItem>

        <template #footer>
          <Flex x-between y-center>
            <Button expand outline @click="navigateTo('/')">
              <template #start>
                <Icon name="ph:caret-left" />
              </template>
              Return to home
            </Button>
            <SharedThemeToggle no-text small button />
          </Flex>
        </template>
      </Sheet>
    </div>

    <div v-else class="admin-layout__sidebar-wrapper">
      <ClientOnly>
        <Sidebar v-model="open" :mini="miniSidebar" class="admin-layout__sidebar">
          <template #header>
            <Flex y-center class="mb-s">
              <Flex y-center gap="s" expand>
                <LogoIcon style="margin-left: 2px" />
                <!-- <h5 v-if="!miniSidebar" class="flex-1">
                  Admin
                </h5> -->
              </Flex>
              <Flex gap="xxs">
                <Tooltip placement="right">
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
                <Tooltip placement="right">
                  <Button v-if="!isBelowExtraLarge" square plain :aria-label="expandToggleLabel" @click="expandedLayout = !expandedLayout">
                    <Icon :name="expandToggleIcon" />
                  </Button>
                  <template #tooltip>
                    <p>Expand admin container</p>
                  </template>
                </Tooltip>
                <Tooltip v-if="!miniSidebar" placement="right">
                  <Button square plain @click="miniSidebar = !miniSidebar">
                    <Icon name="tabler:layout-sidebar-left-collapse" />
                  </Button>
                  <template #tooltip>
                    <p>Collapse sidebar</p>
                  </template>
                </Tooltip>
              </Flex>
            </Flex>
            <Divider :size="0" />
          </template>

          <!-- Only show menu items the user has permissions for -->
          <Tooltip
            v-for="item in accessibleMenuItems"
            :key="item.path"
            :disabled="!miniSidebar"
            placement="right"
          >
            <DropdownItem
              :class="{ selected: route.path === item.path }"
              @click="handleNavigation(item.path)"
            >
              <template v-if="item.icon" #icon>
                <Icon :name="item.icon" />
              </template>
              {{ item.name }}
            </DropdownItem>
            <template #tooltip>
              <p>{{ item.name }}</p>
            </template>
          </Tooltip>

          <template v-if="miniSidebar">
            <Divider />
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
                Expand admin container
              </template>
            </Tooltip>
          </template>

          <template #footer>
            <Flex v-if="miniSidebar" column x-center y-center gap="m">
              <Tooltip placement="right">
                <SharedThemeToggle no-text small button />
                <template #tooltip>
                  <p>Toogle theme</p>
                </template>
              </Tooltip>
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
              <Button expand size="m" outline @click="navigateTo('/')">
                <template #start>
                  <Icon name="ph:caret-left" />
                </template>
                Return to home
              </Button>
              <SharedThemeToggle no-text small button />
            </Flex>
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
@use '@/assets/breakpoints.scss' as *;

.admin-layout {
  min-height: 100vh;
  display: flex;
  position: relative;

  &__mobile-bar {
    display: none;
    width: 100%;
    padding: var(--space-m) var(--space-m) 0;
    position: sticky;
    top: 0;
    z-index: var(--z-nav);
    background-color: color-mix(in srgb, var(--color-bg-lowered) 90%, transparent);
    backdrop-filter: blur(12px);
  }

  &__mobile-sheet {
    :deep(.vui-card-header) {
      padding-left: var(--space-m);
      padding-right: var(--space-m);
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
  }

  .admin-layout__mobile-bar {
    display: block;
    padding: var(--space-s);
  }
}
</style>
