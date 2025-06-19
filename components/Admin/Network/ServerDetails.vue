<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import ServerStatusIndicator from './ServerStatusIndicator.vue'

const props = defineProps<{
  server: Tables<'servers'> | null
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.server && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Server Details</h4>
        <span v-if="props.server" class="color-text-light text-xxs">
          {{ props.server.address }}
        </span>
      </Flex>
    </template>

    <Flex v-if="props.server" column gap="m" class="server-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">ID:</span>
              <span>{{ props.server.id }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Address:</span>
              <span>{{ props.server.address }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Status:</span>
              <ServerStatusIndicator :status="props.server.active ? 'active' : 'inactive'" show-label />
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Created:</span>
              <TimestampDate :date="props.server.created_at" />
            </Grid>
          </Flex>
        </Card>

        <!-- Docker Control Info -->
        <Card separators>
          <template #header>
            <h6>Docker Control</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Enabled:</span>
              <span>{{ props.server.docker_control ? 'Yes' : 'No' }}</span>
            </Grid>

            <template v-if="props.server.docker_control">
              <Grid class="detail-item" expand :columns="2">
                <span class="color-text-light text-bold">Port:</span>
                <span>{{ props.server.docker_control_port || 'Default' }}</span>
              </Grid>

              <Grid class="detail-item" expand :columns="2">
                <span class="color-text-light text-bold">Secure:</span>
                <span>{{ props.server.docker_control_secure ? 'Yes' : 'No' }}</span>
              </Grid>

              <Grid class="detail-item" expand :columns="2">
                <span class="color-text-light text-bold">Subdomain:</span>
                <span>{{ props.server.docker_control_subdomain || 'None' }}</span>
              </Grid>
            </template>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped lang="scss">
.server-detail {
  padding-bottom: var(--space);
}
</style>
