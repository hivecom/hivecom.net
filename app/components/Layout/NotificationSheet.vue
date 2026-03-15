<script setup lang="ts">
import { Button, Flex, Sheet, Tab, Tabs } from '@dolanske/vui'
import NotificationTabActive from '@/components/Notifications/NotificationTabActive.vue'
import NotificationTabPast from '@/components/Notifications/NotificationTabPast.vue'
import NotificationTabSubscriptions from '@/components/Notifications/NotificationTabSubscriptions.vue'
import { useNotifications } from '@/composables/useNotifications'

const { badgeText, fetch, reset } = useNotifications()
const userId = useUserId()
const hasUser = computed(() => Boolean(userId.value))

const open = ref(false)
const activeTab = ref<'active' | 'past' | 'subscriptions'>('active')
const isDev = import.meta.dev

// Dev fixture state passed down to tab components
const devFixturesActive = ref(false)
const devFixtureError = ref(false)
const devFixtureLoading = ref(false)

function toggleDevFixtures() {
  devFixturesActive.value = !devFixturesActive.value
  if (!devFixturesActive.value) {
    devFixtureError.value = false
    devFixtureLoading.value = false
  }
}

// Refs to lazy-loaded tab components for load/reset control
const unreadTab = useTemplateRef<InstanceType<typeof NotificationTabPast>>('unreadTab')
const readTab = useTemplateRef<InstanceType<typeof NotificationTabActive>>('readTab')
const subscriptionsTab = useTemplateRef<InstanceType<typeof NotificationTabSubscriptions>>('subscriptionsTab')

watch(activeTab, async (tab) => {
  await nextTick()
  if (tab === 'past')
    readTab.value?.load()
  else if (tab === 'subscriptions')
    subscriptionsTab.value?.load()
})

watch(hasUser, (ready) => {
  if (ready)
    void fetch()
  else
    reset()
}, { immediate: true })

// Reset lazy tabs and return to active when sheet closes
watch(open, (isOpen) => {
  if (!isOpen) {
    activeTab.value = 'active'
    readTab.value?.reset()
    subscriptionsTab.value?.reset()
  }
})

function handleNavigate() {
  open.value = false
}

const showActiveFooter = computed(
  () => activeTab.value === 'active' && (unreadTab.value?.hasAnyNotifications ?? false),
)
const showPastFooter = computed(
  () => activeTab.value === 'past' && (readTab.value?.hasNotifications ?? false),
)
const showSubscriptionsFooter = computed(
  () => activeTab.value === 'subscriptions' && (subscriptionsTab.value?.hasSubscriptions ?? false),
)
const showFooter = computed(() => showActiveFooter.value || showPastFooter.value || showSubscriptionsFooter.value)
</script>

<template>
  <div class="notification-menu" aria-live="polite">
    <Button square plain aria-label="Open notifications" class="vui-button-accent-weak" @click="open = true">
      <Icon name="ph:bell" :size="20" />
      <span v-if="badgeText" class="notification-menu__badge" />
    </Button>

    <Sheet
      :open="open"
      position="right"
      :card="{ separators: true }"
      :size="400"
      @close="open = false"
    >
      <template #header>
        <Flex x-between y-center expand>
          <h4>Notifications</h4>
          <Flex v-if="isDev" gap="xs" y-center>
            <Button
              square
              size="s"
              :variant="devFixtureLoading ? 'accent' : 'gray'"
              aria-label="Toggle loading fixture"
              @click="devFixtureLoading = !devFixtureLoading"
            >
              <Icon name="ph:spinner" />
            </Button>
            <Button
              square
              size="s"
              :variant="devFixtureError ? 'accent' : 'gray'"
              aria-label="Toggle error fixture"
              @click="devFixtureError = !devFixtureError"
            >
              <Icon name="ph:warning-circle" />
            </Button>
            <Button
              square
              size="s"
              :variant="devFixturesActive ? 'accent' : 'gray'"
              aria-label="Toggle all card fixtures"
              @click="toggleDevFixtures"
            >
              <Icon name="ph:flask" />
            </Button>
          </Flex>
        </Flex>
      </template>

      <Flex column class="notification-menu__body">
        <Tabs v-model="activeTab" variant="filled" expand>
          <Tab value="active">
            Active
          </Tab>
          <Tab value="past">
            Past
          </Tab>
          <Tab value="subscriptions">
            Subscriptions
          </Tab>
        </Tabs>

        <Flex expand>
          <NotificationTabPast
            v-if="activeTab === 'active'"
            ref="unreadTab"
            v-model:dev-fixtures-active="devFixturesActive"
            v-model:dev-fixture-error="devFixtureError"
            v-model:dev-fixture-loading="devFixtureLoading"
            @navigate="handleNavigate"
          />

          <NotificationTabActive
            v-else-if="activeTab === 'past'"
            ref="readTab"
            v-model:dev-fixtures-active="devFixturesActive"
            @navigate="handleNavigate"
          />

          <NotificationTabSubscriptions
            v-else-if="activeTab === 'subscriptions'"
            ref="subscriptionsTab"
            v-model:dev-fixtures-active="devFixturesActive"
            @navigate="handleNavigate"
          />
        </Flex>
      </Flex>

      <template v-if="showFooter" #footer>
        <Button
          v-if="showActiveFooter"
          expand
          size="s"
          variant="gray"
          :loading="unreadTab?.markAllLoading ?? false"
          @click="unreadTab?.markAllAsRead()"
        >
          Mark all as read
        </Button>
        <Button
          v-if="showPastFooter"
          expand
          size="s"
          variant="danger"
          :loading="readTab?.clearAllLoading ?? false"
          @click="readTab?.clearAll()"
        >
          Clear all
        </Button>
        <Button
          v-if="showSubscriptionsFooter"
          expand
          size="s"
          variant="danger"
          :loading="subscriptionsTab?.clearAllLoading ?? false"
          @click="subscriptionsTab?.triggerClearAll()"
        >
          Clear subscriptions
        </Button>
      </template>
    </Sheet>
  </div>
</template>

<style lang="scss">
</style>
