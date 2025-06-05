<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Sidebar, Spinner } from '@dolanske/vui'
import { useStorage as useLocalStorage } from '@vueuse/core'

const router = useRouter()
const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Initialize user role from database
const userRole = ref<string | null>(null)
const isLoading = ref(true)
const isAuthorized = ref(false)

// Check user role and redirect if not authorized
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

    // User is authorized
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

const menuItems = [
  { name: 'Dashboard', path: '/admin/', icon: 'ph:squares-four' },
  { name: 'Users', path: '/admin/users', icon: 'ph:user' },
  { name: 'Expenses', path: '/admin/expenses', icon: 'ph:coins' },
  { name: 'Events', path: '/admin/events', icon: 'ph:calendar-blank' },
  { name: 'Games', path: '/admin/games', icon: 'ph:game-controller' },
  { name: 'Network', path: '/admin/network', icon: 'ph:computer-tower' },
  { name: 'Referendums', path: '/admin/referendums', icon: 'ph:user-sound' },
]

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
      <Sidebar v-model="open" :mini="miniSidebar">
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
        <DropdownItem
          v-for="item in menuItems"
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
            <DropdownItem square icon="ph:caret-left" data-title-right="Close admin console" @click="router.push('/')" />
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

<style scoped lang=scss>
:deep(h3) {
  margin-bottom: var(--space-m);
}

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
