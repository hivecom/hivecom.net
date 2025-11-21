<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import { capitalize, computed } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import ReferendumResults from '@/components/Shared/ReferendumResults.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

const props = defineProps<{
  referendum: Tables<'referendums'> | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Setup Supabase client
const supabase = useSupabaseClient()

// Fetch votes for this referendum
const { data: referendumVotes } = await useAsyncData(
  `referendum-votes-${props.referendum?.id}`,
  async () => {
    if (!props.referendum?.id)
      return []

    const { data, error } = await supabase
      .from('referendum_votes')
      .select('*')
      .eq('referendum_id', props.referendum.id)

    if (error) {
      console.error('Error fetching referendum votes:', error)
      return []
    }

    return data || []
  },
  {
    watch: [() => props.referendum?.id],
    default: () => [],
  },
)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(referendum: Tables<'referendums'>) {
  emit('edit', referendum)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(referendum: Tables<'referendums'>) {
  emit('delete', referendum)
  isOpen.value = false
}

// Helper function to determine referendum status
function getReferendumStatus(referendum: Tables<'referendums'>): string {
  const now = new Date()
  const start = new Date(referendum.date_start)
  const end = new Date(referendum.date_end)

  if (now < start)
    return 'upcoming'
  if (now > end)
    return 'concluded'
  return 'active'
}

// Computed vote count
const voteCount = computed(() => referendumVotes.value?.length || 0)
</script>

<template>
  <Sheet
    :open="!!props.referendum && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>Referendum Details</h4>
          <span v-if="props.referendum" class="text-color-light text-xxs">
            {{ props.referendum.title }}
          </span>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.referendum"
            resource-type="referendums"
            :item="props.referendum"
            :show-labels="true"
            @edit="(referendumItem) => handleEdit(referendumItem as Tables<'referendums'>)"
            @delete="(referendumItem) => handleDelete(referendumItem as Tables<'referendums'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.referendum" column gap="m" class="referendum-details">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">ID:</span>
              <span>{{ props.referendum.id }}</span>
            </Grid>

            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Title:</span>
              <span>{{ props.referendum.title }}</span>
            </Grid>

            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Status:</span>
              <span>

                <Badge
                  size="xs"
                  :variant="getReferendumStatus(props.referendum) === 'active' ? 'success' : getReferendumStatus(props.referendum) === 'upcoming' ? 'warning' : 'neutral'"
                >
                  {{ capitalize(getReferendumStatus(props.referendum)) }}
                </Badge>
              </span>
            </Grid>

            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Type:</span>
              <span>
                <Badge
                  size="xs"
                  :variant="props.referendum.multiple_choice ? 'accent' : 'neutral'"
                >
                  {{ props.referendum.multiple_choice ? 'Multiple Choice' : 'Single Choice' }}
                </Badge>
              </span>
            </Grid>

            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Start Date:</span>
              <TimestampDate
                :date="props.referendum.date_start"
                size="s"
                class="text-color"
              />
            </Grid>

            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">End Date:</span>
              <TimestampDate
                :date="props.referendum.date_end"
                size="s"
                class="text-color"
              />
            </Grid>

            <Grid class="referendum-details__item" expand :columns="2">
              <span class="text-color-light text-bold">Votes:</span>
              <span>{{ voteCount }} vote{{ voteCount !== 1 ? 's' : '' }}</span>
            </Grid>
          </Flex>
        </Card>        <!-- Description -->
        <Card v-if="props.referendum.description" separators>
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.referendum.description }}</p>
        </Card>

        <!-- Results -->
        <Flex v-if="referendumVotes && referendumVotes.length > 0" expand>
          <ReferendumResults
            :referendum="props.referendum"
            :votes="referendumVotes"
          />
        </Flex>
        <Card v-else class="p-l">
          <Flex x-between y-center class="mb-m">
            <h3>Results</h3>
          </Flex>
          <div class="text-center p-l">
            <Icon name="ph:chart-bar" size="2rem" class="text-color-light mb-s" />
            <p class="text-color-light">
              No votes yet
            </p>
          </div>
        </Card><!-- Metadata -->
        <Metadata
          :created-at="props.referendum.created_at"
          :created-by="props.referendum.created_by"
          :modified-at="props.referendum.modified_at"
          :modified-by="props.referendum.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.referendum-details {
  padding-bottom: var(--space);

  &__not-assigned {
    opacity: 0.5;
  }

  &__item {
    min-height: 1.5rem;
  }
}
</style>
