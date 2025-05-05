<script setup lang="ts">
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { Badge, Card, Flex, Grid, Sheet } from '@dolanske/vui'

const props = defineProps<{
  gameserver: any | null
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
    :open="!!props.gameserver && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <h3>{{ props.gameserver ? props.gameserver.name : 'Gameserver Details' }}</h3>
    </template>

    <Flex v-if="props.gameserver" column gap="m" class="gameserver-detail">
      <Flex column gap="m" expand>
        <!-- Description -->
        <Card v-if="props.gameserver.description" separators>
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.gameserver.description }}</p>
        </Card>

        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">ID:</span>
              <span>{{ props.gameserver.id }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Game:</span>
              <span>{{ props.gameserver.game_name || 'Unknown' }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Region:</span>
              <span v-if="props.gameserver.region === 'eu'">Europe</span>
              <span v-else-if="props.gameserver.region === 'na'">North America</span>
              <span v-else-if="props.gameserver.region === 'all'">All Regions</span>
              <span v-else>Unknown</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Administrator:</span>
              <span>{{ props.gameserver.administrator || 'None assigned' }}</span>
            </Grid>
          </Flex>
        </Card>

        <!-- Network Details -->
        <Card separators>
          <template #header>
            <h6>Network details</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Addresses:</span>
              <Flex v-if="props.gameserver.addresses && props.gameserver.addresses.length" gap="xs" wrap>
                <Badge v-for="address in props.gameserver.addresses" :key="address">
                  {{ address }}
                </Badge>
              </Flex>
              <span v-else>None configured</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Port:</span>
              <span>{{ props.gameserver.port || 'Not specified' }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Container:</span>
              <span>{{ props.gameserver.container || 'Not linked' }}</span>
            </Grid>
          </Flex>
        </Card>

        <!-- Metadata -->
        <Card separators>
          <template #header>
            <h6>Metadata</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.gameserver.created_at" />
                <span v-if="props.gameserver.created_by" class="metadata-by">by {{ props.gameserver.created_by }}</span>
              </Flex>
            </Grid>

            <Grid v-if="props.gameserver.modified_at" class="detail-item" expand :columns="2">
              <span class="detail-label">Modified:</span>
              <Flex column>
                <TimestampDate :date="props.gameserver.modified_at" />
                <span v-if="props.gameserver.modified_by" class="metadata-by">by {{ props.gameserver.modified_by }}</span>
              </Flex>
            </Grid>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.gameserver-detail {
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
.metadata-by {
  font-size: 1.3rem;
  color: var(--color-text-light);
}
</style>
