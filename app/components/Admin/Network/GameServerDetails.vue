<script setup lang="ts">
import type { Tables } from '@/types/database.types'

import { Badge, Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import UserLink from '@/components/Shared/UserLink.vue'

interface GameServerWithJoins extends Tables<'gameservers'> {
  game_name?: string
}

const props = defineProps<{
  gameserver: GameServerWithJoins | null
}>()

// Define emits
const emit = defineEmits(['edit'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get admin permissions
const { hasPermission } = useAdminPermissions()
const canUpdateGameservers = computed(() => hasPermission('gameservers.update'))

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
        <Flex column :gap="0">
          <h4>Game Server Details</h4>
          <span v-if="props.gameserver" class="text-color-light text-xxs">
            {{ props.gameserver.name }}
          </span>
        </Flex>
        <Flex y-center gap="s">
          <Button
            v-if="props.gameserver && canUpdateGameservers"
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
              <span class="text-color-light text-bold">ID:</span>
              <span>{{ props.gameserver.id }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Name:</span>
              <span>{{ props.gameserver.name }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Game:</span>
              <span>{{ props.gameserver.game_name || 'Unknown' }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Region:</span>
              <RegionIndicator :region="props.gameserver.region" show-label />
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Administrator:</span>
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
              <span class="text-color-light text-bold">Addresses:</span>
              <Flex v-if="props.gameserver.addresses && props.gameserver.addresses.length" gap="xs" wrap>
                <Badge v-for="address in props.gameserver.addresses" :key="address">
                  {{ address }}
                </Badge>
              </Flex>
              <span v-else>None configured</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Port:</span>
              <span>{{ props.gameserver.port || 'Not specified' }}</span>
            </Grid>

            <Grid class="gameserver-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Container:</span>
              <Flex>
                <Badge v-if="props.gameserver.container">
                  {{ props.gameserver.container }}
                </Badge>
                <Badge v-if="!props.gameserver.container" variant="neutral">
                  Not linked
                </Badge>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.gameserver.created_at"
          :created-by="props.gameserver.created_by"
          :modified-at="props.gameserver.modified_at"
          :modified-by="props.gameserver.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.gameserver-details {
  padding-bottom: var(--space);

  &__metadata-by {
    font-size: var(--font-size-l);
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
</style>
