<script setup lang="ts">
import type { GameDetailsFormState } from '@/lib/games/details'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import GameDetailsFields from '@/components/Community/Games/GameDetailsFields.vue'
import { invalidateGamesCache } from '@/composables/useDataGames'
import { gameDetailsFromRow, gameDetailsPayload, validateGameDetails } from '@/lib/games/details'

const props = defineProps<{
  game: Tables<'games'>
}>()

const emit = defineEmits<{
  saved: []
}>()

const open = defineModel<boolean>('open')

const supabase = useSupabaseClient()
const userId = useUserId()

const form = ref<GameDetailsFormState>(gameDetailsFromRow(props.game))

const validation = computed(() => validateGameDetails(form.value))
const isValid = computed(() => Object.values(validation.value).every(Boolean))

const saveLoading = ref(false)
const saveError = ref<string | null>(null)

// Load the row fresh on every open so a cancelled edit leaves nothing behind
watch(open, (isOpen) => {
  if (!isOpen)
    return

  form.value = gameDetailsFromRow(props.game)
  saveError.value = null
})

async function handleSubmit() {
  if (!isValid.value)
    return

  saveLoading.value = true
  saveError.value = null

  try {
    const { error } = await supabase
      .from('games')
      .update({
        ...gameDetailsPayload(form.value),
        modified_at: new Date().toISOString(),
        modified_by: userId.value,
      })
      .eq('id', props.game.id)

    if (error)
      throw error

    invalidateGamesCache()
    open.value = false
    emit('saved')
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to update game. Please try again.'
  }
  finally {
    saveLoading.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    size="l"
    scrollable
    :card="{ separators: true }"
    :can-dismiss="false"
    @close="open = false"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Edit Game</h4>
        <p class="text-color-light text-xs">
          {{ props.game.name }}
        </p>
      </Flex>
    </template>

    <GameDetailsFields v-model="form" :validation="validation" />

    <p v-if="saveError" class="text-xs text-color-red">
      {{ saveError }}
    </p>

    <template #footer>
      <Flex gap="xs" x-between expand>
        <!-- Name, shorthand, Steam ID and assets need the full admin form -->
        <NuxtLink :to="`/admin/games?game=${props.game.id}`">
          <Button plain>
            <template #start>
              <Icon name="ph:arrow-square-out" />
            </template>
            Open in admin
          </Button>
        </NuxtLink>

        <Flex gap="xs">
          <Button plain @click="open = false">
            Cancel
          </Button>
          <Button
            variant="accent"
            :disabled="!isValid"
            :loading="saveLoading"
            @click="handleSubmit"
          >
            Save changes
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.text-color-red {
  color: var(--color-text-red);
  padding-top: var(--space);
}
</style>
