<script setup lang="ts">
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import ServerStatusIndicator from './ServerStatusIndicator.vue'

const props = defineProps<{
  server: any | null
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
      <h3>{{ props.server ? props.server.address : 'Server Details' }}</h3>
    </template>

    <Flex v-if="props.server" column gap="m" class="server-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Status:</span>
              <ServerStatusIndicator :status="props.server.active ? 'active' : 'inactive'" show-label />
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">ID:</span>
              <span>{{ props.server.id }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Created:</span>
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
              <span class="detail-label">Enabled:</span>
              <span>{{ props.server.docker_control ? 'Yes' : 'No' }}</span>
            </Grid>

            <template v-if="props.server.docker_control">
              <Grid class="detail-item" expand :columns="2">
                <span class="detail-label">Port:</span>
                <span>{{ props.server.docker_control_port || 'Default' }}</span>
              </Grid>

              <Grid class="detail-item" expand :columns="2">
                <span class="detail-label">Secure:</span>
                <span>{{ props.server.docker_control_secure ? 'Yes' : 'No' }}</span>
              </Grid>

              <Grid class="detail-item" expand :columns="2">
                <span class="detail-label">Subdomain:</span>
                <span>{{ props.server.docker_control_subdomain || 'None' }}</span>
              </Grid>
            </template>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.server-detail {
  padding-bottom: var(--space);
}
.detail-label {
  font-weight: 500;
  color: var(--color-text-light);
}
h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}
</style>
