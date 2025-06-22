<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Sidebar, Spinner } from '@dolanske/vui'
import { useStorage as useLocalStorage } from '@vueuse/core'

const router = useRouter()
const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Initialize user role and permissions from database
const userRole = ref<string | null>(null)
const userPermissions = ref<string[]>([])
const isLoading = ref(true)
const isAuthorized = ref(false)

// Check user role and permissions, redirect if not authorized
onMounted(async () => {
  try {
    if (!user.value) {
      // User not authenticated, redirect to landing page
      await router.push('/')
      return
    }

    // Fetch user role from user_roles table
    const { error, data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.value.id)
      .single()

    if (error) {
      console.error('Error fetching user role:', error)
      // If error fetching role or no role found, redirect to landing page
      await router.push('/')
      return
    }

    userRole.value = roleData?.role || null

    // Check if user has admin or moderator role
    const hasRequiredRole = userRole.value === 'admin' || userRole.value === 'moderator'

    if (!hasRequiredRole) {
      // User doesn't have required role, redirect to landing page
      await router.push('/')
      return
    }

    // Fetch role permissions from role_permissions table
    const { data: permissionsData, error: permissionsError } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role', userRole.value as 'admin' | 'moderator')

    if (permissionsError) {
      console.error('Error fetching role permissions:', permissionsError)
      // Continue with empty permissions - this will limit access
    }
    else {
      userPermissions.value = permissionsData?.map(p => p.permission) || []
    }

    // User is authorized (has admin/moderator role)
    isAuthorized.value = true
  }
  catch (error) {
    console.error('Error in admin layout:', error)
    await router.push('/')
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
    await router.push('/')
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
    name: 'Announcements',
    path: '/admin/announcements',
    icon: 'ph:megaphone',
    permissions: ['announcements.read', 'announcements.create', 'announcements.update', 'announcements.delete'],
  },
  {
    name: 'Complaints',
    path: '/admin/complaints',
    icon: 'ph:flag',
    permissions: ['complaints.read', 'complaints.create', 'complaints.update', 'complaints.delete'],
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
    name: 'Network',
    path: '/admin/network',
    icon: 'ph:computer-tower',
    permissions: ['gameservers.read', 'gameservers.create', 'gameservers.update', 'gameservers.delete', 'servers.read', 'servers.create', 'servers.update', 'servers.delete', 'containers.read', 'containers.create', 'containers.update', 'containers.delete'],
  },
  {
    name: 'Referendums',
    path: '/admin/referendums',
    icon: 'ph:user-sound',
    permissions: ['referendums.read', 'referendums.create', 'referendums.update', 'referendums.delete'],
  },
  {
    name: 'Roles',
    path: '/admin/roles',
    icon: 'ph:shield-check',
    permissions: ['roles.read'],
  },
  {
    name: 'Users',
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
const open = ref(true)
</script>

<template>
  <!-- Show loading spinner while checking authorization -->
  <div v-if="isLoading" class="admin-layout__loading">
    <Spinner />
  </div>

  <!-- Show admin layout only if authorized -->
  <div v-else-if="isAuthorized" class="admin-layout vui-sidebar-layout">
    <ClientOnly>
      <Sidebar v-model="open" :mini="miniSidebar" style="position: static">
        <template #header>
          <Flex y-center class="mb-s">
            <Flex y-center gap="s" expand>
              <SharedIcon />
              <h5 v-if="!miniSidebar" class="flex-1">
                Admin
              </h5>
            </Flex>
            <Button v-if="!miniSidebar" square plain @click="miniSidebar = !miniSidebar">
              <Icon name="tabler:layout-sidebar-left-collapse" />
            </Button>
          </Flex>
          <Divider :size="0" />
        </template>

        <!-- Only show menu items the user has permissions for -->
        <DropdownItem
          v-for="item in accessibleMenuItems"
          :key="item.path"
          :icon="item.icon"
          :class="{ selected: route.path === item.path }"
          @click="navigateTo(item.path)"
        >
          {{ item.name }}
        </DropdownItem>

        <template v-if="miniSidebar">
          <Divider />
          <DropdownItem square icon="tabler:layout-sidebar-left-expand" @click="miniSidebar = !miniSidebar" />
        </template>

        <template #footer>
          <Flex v-if="miniSidebar" column x-center y-center gap="m">
            <SharedThemeToggle no-text small />
            <DropdownItem square icon="ph:caret-left" data-title-right="Close admin console" aria-label="Close admin console" @click="router.push('/')" />
          </Flex>
          <Flex v-else x-between y-center>
            <Button size="s" outline @click="router.push('/')">
              <template #start>
                <Icon name="ph:caret-left" />
              </template>
              Close
            </Button>
            <SharedThemeToggle no-text small />
          </Flex>
        </template>
      </Sidebar>
    </ClientOnly>
    <main>
      <div class="container container-l pt-xl pb-l">
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
  &__loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
  }
}
</style>
