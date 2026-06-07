<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Sheet } from '@dolanske/vui'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import ServerStatusIndicator from './ServerStatusIndicator.vue'

const props = defineProps<{
  server: Tables<'network_servers'> | null
}>()

// Declare emits for edit event
const emit = defineEmits(['edit'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')
const isMobile = useBreakpoint('<s')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit button click: close details, then emit edit
function handleEdit() {
  isOpen.value = false
  emit('edit', props.server)
}
</script>

<template>
  <Sheet
    :open="!!props.server && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Server Details</h4>
          <p v-if="props.server" class="text-color-light text-xs">
            {{ props.server.address }}
          </p>
        </Flex>
        <Flex y-center gap="s">
          <Button
            v-if="props.server && isMobile"
            square
            @click="handleEdit"
          >
            <Icon name="ph:pencil" />
          </Button>
          <Button
            v-else-if="props.server"
            @click="handleEdit"
          >
            <template #start>
              <Icon name="ph:pencil" />
            </template>
            Edit
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.server" column gap="m" class="server-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <DetailTable>
          <template #header>
            <Icon name="ph:hard-drives" />
            <h6>Overview</h6>
          </template>
          <DetailRow label="ID">
            <CopyValue :text="String(props.server.id)" link />
          </DetailRow>
          <DetailRow label="Address">
            <CopyValue :text="props.server.address" link />
          </DetailRow>
          <DetailRow label="Status">
            <ServerStatusIndicator :status="!props.server.active ? 'inactive' : props.server.docker_control && !props.server.accessible ? 'inaccessible' : 'active'" show-label />
          </DetailRow>
          <DetailRow label="Accessible">
            <ServerStatusIndicator :status="props.server.docker_control ? (props.server.accessible ? 'accessible' : 'inaccessible') : 'not_enabled'" show-label />
          </DetailRow>
          <DetailRow label="Last Accessed">
            <TimestampDate v-if="props.server.last_accessed" :date="props.server.last_accessed" />
            <span v-else class="text-s">Never</span>
          </DetailRow>
          <DetailRow label="Created">
            <TimestampDate :date="props.server.created_at" />
          </DetailRow>
        </DetailTable>

        <!-- Docker Control Info -->
        <DetailTable>
          <template #header>
            <Icon name="ph:circles-three" />
            <h6>Docker Control</h6>
          </template>
          <DetailRow label="Enabled">
            <span class="text-s">{{ props.server.docker_control ? 'Yes' : 'No' }}</span>
          </DetailRow>
          <DetailRow label="Port" :hidden="!props.server.docker_control">
            <span class="text-s">{{ props.server.docker_control_port || 'Default' }}</span>
          </DetailRow>
          <DetailRow label="Secure" :hidden="!props.server.docker_control">
            <span class="text-s">{{ props.server.docker_control_secure ? 'Yes' : 'No' }}</span>
          </DetailRow>
          <DetailRow label="Subdomain" :hidden="!props.server.docker_control">
            <CopyValue v-if="props.server.docker_control_subdomain" :text="`${props.server.docker_control_subdomain}.${props.server.address}`" link />
            <span v-else class="text-s">None</span>
          </DetailRow>
        </DetailTable>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped lang="scss">
.server-detail {
  padding-bottom: var(--space);
}
</style>
