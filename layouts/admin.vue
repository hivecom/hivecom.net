<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Grid, Sidebar, Spinner } from '@dolanske/vui'
// import { useStorage } from '@vueuse/core'

const router = useRouter()
const route = useRoute()

const menuItems = [
  { name: 'Dashboard', path: '/admin/', icon: 'ph:squares-four' },
  { name: 'Users', path: '/admin/users', icon: 'ph:user' },
  { name: 'Expenses', path: '/admin/expenses', icon: 'ph:coins' },
  { name: 'Events', path: '/admin/events', icon: 'ph:calendar-blank' },
  { name: 'Games', path: '/admin/games', icon: 'ph:game-controller' },
  { name: 'Network', path: '/admin/network', icon: 'ph:computer-tower' },
  { name: 'Referendums', path: '/admin/referendums', icon: 'ph:user-sound' },
]

// TODO: need to fix something in Sidebar so for now it won't save to local storage
// const miniSidebar = useStorage('admin-sidebar-open', false)
const miniSidebar = ref(false)
</script>

<template>
  <div class="vui-sidebar-layout">
    <Sidebar :model-value="true" :mini="miniSidebar">
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
</style>
