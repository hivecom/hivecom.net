<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Flex, Sheet } from '@dolanske/vui'
import { capitalize, computed } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import ReferendumResults from '@/components/Shared/ReferendumResults.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { getReferendumStatus, getReferendumStatusVariant } from '@/lib/referendums'

const props = defineProps<{
  referendum: Tables<'referendums'> | null
}>()

// Define emits
const emit = defineEmits<{
  edit: [referendum: Tables<'referendums'>]
  delete: [referendum: Tables<'referendums'>]
}>()

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

// Computed vote count
const voteCount = computed(() => referendumVotes.value?.length || 0)
</script>

<template>
  <Sheet
    :open="!!props.referendum && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Referendum Details</h4>
          <p v-if="props.referendum" class="text-color-light text-xs">
            <NuxtLink :to="`/votes/${props.referendum.id}`" target="_blank">
              {{ props.referendum.title }}
            </NuxtLink>
          </p>
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
        <DetailTable>
          <template #header>
            <Icon name="ph:scales" />
            <h6>Overview</h6>
          </template>

          <DetailRow label="ID">
            <CopyValue :text="String(props.referendum.id)" link />
          </DetailRow>

          <DetailRow label="Status">
            <Badge
              size="m"
              :variant="getReferendumStatusVariant(getReferendumStatus(props.referendum))"
            >
              {{ capitalize(getReferendumStatus(props.referendum)) }}
            </Badge>
          </DetailRow>

          <DetailRow label="Type">
            <Badge
              size="m"
              :variant="props.referendum.multiple_choice ? 'accent' : 'neutral'"
            >
              {{ props.referendum.multiple_choice ? 'Multiple Choice' : 'Single Choice' }}
            </Badge>
          </DetailRow>

          <DetailRow label="Visibility">
            <Badge
              size="m"
              :variant="props.referendum.is_public ? 'success' : 'neutral'"
            >
              <Icon :name="props.referendum.is_public ? 'ph:globe' : 'ph:lock'" />
              {{ props.referendum.is_public ? 'Public' : 'Private' }}
            </Badge>
          </DetailRow>

          <DetailRow label="Start Date">
            <TimestampDate :date="props.referendum.date_start" size="s" class="text-color" />
          </DetailRow>

          <DetailRow label="End Date">
            <TimestampDate :date="props.referendum.date_end" size="s" class="text-color" />
          </DetailRow>

          <DetailRow label="Votes">
            <span class="text-s">{{ voteCount }} vote{{ voteCount !== 1 ? 's' : '' }}</span>
          </DetailRow>
        </DetailTable>

        <!-- Description -->
        <DetailTable v-if="props.referendum.description">
          <template #header>
            <Icon name="ph:text-align-left" />
            <h6>Description</h6>
          </template>
          <div class="referendum-details__description">
            <p class="text-s">
              {{ props.referendum.description }}
            </p>
          </div>
        </DetailTable>

        <!-- Results -->
        <Flex v-if="referendumVotes && referendumVotes.length > 0" expand>
          <ReferendumResults
            :referendum="props.referendum"
            :votes="referendumVotes"
          />
        </Flex>
        <DetailTable v-else>
          <template #header>
            <Icon name="ph:chart-bar" />
            <h6>Results</h6>
          </template>
          <div class="referendum-details__no-votes">
            <Icon name="ph:chart-bar" size="2rem" class="text-color-light" />
            <p class="text-color-light">
              No votes yet
            </p>
          </div>
        </DetailTable>

        <!-- Metadata -->
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

  &__description {
    padding: var(--space-m);
  }

  &__no-votes {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-s);
    padding: var(--space-l);
  }
}
</style>
