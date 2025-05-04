<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Sidebar, Spinner } from '@dolanske/vui'

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
</script>

<template>
  <div class="vui-sidebar-layout">
    <Sidebar :model-value="true">
      <template #header>
        <Flex y-center class="mb-s" x-between>
          <Flex y-center gap="s">
            <SharedIcon />
            <h5>
              Admin
            </h5>
          </Flex>
          <SharedThemeToggle no-text small />
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

      <template #footer>
        <Button expand size="s" outline @click="router.push('/')">
          <template #start>
            <Icon name="ph:caret-left" />
          </template>
          Exit
        </Button>
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
