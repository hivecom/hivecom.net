<script setup lang="ts">
import type { EmailOverview } from '@/composables/useEmailAdmin'
import { Flex, Tab, Tabs } from '@dolanske/vui'
import { computed, ref } from 'vue'
import EmailBroadcastForm from '@/components/Admin/Email/EmailBroadcastForm.vue'
import EmailKPIs from '@/components/Admin/Email/EmailKPIs.vue'
import EmailSuppressionTable from '@/components/Admin/Email/EmailSuppressionTable.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useAdminTabs } from '@/composables/useAdminTabs'

definePageMeta({ layout: 'admin' })

const { canViewEmail, canSendBroadcasts } = useAdminPermissions()

if (!canViewEmail.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view email administration',
  })
}

// Read-only admins keep the status cards and the suppression list, but never
// the compose form.
const availableTabs = computed(() => {
  const tabs: { label: string, value: 'Broadcast' | 'Suppression' }[] = []
  if (canSendBroadcasts.value)
    tabs.push({ label: 'Broadcast', value: 'Broadcast' })
  tabs.push({ label: 'Suppression', value: 'Suppression' })
  return tabs
})

const { activeTab } = useAdminTabs(availableTabs)

// Shared with the KPI row: the form reads the recipient count from the
// overview, and bumps the signal after a send so the quota card catches up.
const refreshSignal = ref(0)
const overview = ref<EmailOverview | null>(null)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0" expand>
      <h1>Email</h1>
      <p class="text-color-light">
        Check SES-backed delivery health, manage suppressed addresses, and send broadcasts to members
      </p>
    </Flex>

    <EmailKPIs v-model:refresh-signal="refreshSignal" v-model:overview="overview" />

    <Tabs v-if="availableTabs.length > 1" v-model="activeTab">
      <Tab v-for="tab in availableTabs" :key="tab.value" :value="tab.value">
        {{ tab.label }}
      </Tab>
    </Tabs>

    <!-- v-show rather than v-if so switching tabs doesn't wipe a half-written draft -->
    <Flex v-if="canSendBroadcasts" v-show="activeTab === 'Broadcast'" column gap="l" expand>
      <EmailBroadcastForm :recipients="overview?.recipients ?? null" @sent="refreshSignal++" />
    </Flex>

    <Flex v-show="activeTab === 'Suppression'" column gap="l" expand>
      <EmailSuppressionTable />
    </Flex>
  </Flex>
</template>
