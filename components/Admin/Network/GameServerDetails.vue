<script setup lang="ts">
import { Badge, Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '~/components/Shared/UserLink.vue'

const props = defineProps<{
  gameserver: any | null
}>()

// Define emits
const emit = defineEmits(['edit'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit button click
function handleEdit() {
  emit('edit', props.gameserver)
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
      <Flex x-between y-center>
        <h4>Game Server Details</h4>
        <Flex y-center gap="s">
          <Button
            v-if="props.gameserver"
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

    <Flex v-if="props.gameserver" column gap="m" class="gameserver-details">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">ID:</span>
              <span>{{ props.gameserver.id }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Name:</span>
              <span>{{ props.gameserver.name }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Game:</span>
              <span>{{ props.gameserver.game_name || 'Unknown' }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Region:</span>
              <RegionIndicator :region="props.gameserver.region" show-label />
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Administrator:</span>
              <div :class="{ 'gameserver-details__not-assigned': !props.gameserver.administrator }">
                <UserLink v-if="props.gameserver.administrator" :user-id="props.gameserver.administrator" />
                <span v-else>Not Assigned</span>
              </div>
            </Grid>
          </Flex>
        </Card>

        <!-- Description -->
        <Card v-if="props.gameserver.description" separators>
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.gameserver.description }}</p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.gameserver.markdown" separators>
          <template #header>
            <h6>Markdown</h6>
          </template>

          <MDRenderer :md="props.gameserver.markdown" class="gameserver-details__markdown-content" />
        </Card>

        <!-- Network Details -->
        <Card separators>
          <template #header>
            <h6>Network details</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Addresses:</span>
              <Flex v-if="props.gameserver.addresses && props.gameserver.addresses.length" gap="xs" wrap>
                <Badge v-for="address in props.gameserver.addresses" :key="address">
                  {{ address }}
                </Badge>
              </Flex>
              <span v-else>None configured</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Port:</span>
              <span>{{ props.gameserver.port || 'Not specified' }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Container:</span>
              <Flex>
                <Badge v-if="props.gameserver.container">
                  {{ props.gameserver.container }}
                </Badge>
                <span v-else>Not linked</span>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Metadata -->
        <Card separators>
          <template #header>
            <h6>Metadata</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.gameserver.created_at" />
                <Flex v-if="props.gameserver.created_by" gap="xs" y-center class="gameserver-details__metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.gameserver.created_by" />
                </Flex>
              </Flex>
            </Grid>

            <Grid v-if="props.gameserver.modified_at" class="gameserver-details__item" expand :columns="2">
              <span class="gameserver-details__label">Modified:</span>
              <Flex column>
                <TimestampDate :date="props.gameserver.modified_at" />
                <Flex v-if="props.gameserver.modified_by" gap="xs" y-center class="gameserver-details__metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.gameserver.modified_by" />
                </Flex>
              </Flex>
            </Grid>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.gameserver-details {
  padding-bottom: var(--space);

  &__label {
    font-weight: 500;
    color: var(--color-text-light);
  }

  &__metadata-by {
    font-size: 1.3rem;
    color: var(--color-text-light);
  }

  &__markdown {
    width: 100%;
  }

  &__markdown-skeleton {
    width: 100%;
  }

  &__markdown-content {
    h1 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }

    h2 {
      margin-top: var(--space-s);
      font-size: var(--font-size-xxl);
    }
  }

  &__not-assigned {
    opacity: 0.5;
  }
}

h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}
</style>
