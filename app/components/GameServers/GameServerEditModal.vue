<script setup lang="ts">
import type { GameServerDetailsFormState } from '@/lib/gameservers'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Modal, Tooltip } from '@dolanske/vui'
import { ref, watch } from 'vue'
import GameServerDetailsFields from '@/components/GameServers/GameServerDetailsFields.vue'
import { invalidateGameserversCache } from '@/composables/useDataGameservers'
import { gameServerDetailsFromRow, gameServerDetailsPayload } from '@/lib/gameservers'

const props = defineProps<{
  gameserver: Pick<Tables<'network_gameservers'>, 'id' | 'name' | 'addresses' | 'description' | 'markdown'>
}>()

const emit = defineEmits<{
  saved: []
}>()

const open = defineModel<boolean>('open')
const fullscreen = ref(false)

const supabase = useSupabaseClient()
const userId = useUserId()

const formFieldsRef = ref<InstanceType<typeof GameServerDetailsFields> | null>(null)

const form = ref<GameServerDetailsFormState>(gameServerDetailsFromRow(props.gameserver))

const saveLoading = ref(false)
const saveError = ref<string | null>(null)

// Load the row fresh on every open so a cancelled edit leaves nothing behind
watch(open, (isOpen) => {
  if (isOpen) {
    form.value = gameServerDetailsFromRow(props.gameserver)
    saveError.value = null
    return
  }

  fullscreen.value = false
})

async function handleSubmit() {
  saveLoading.value = true
  saveError.value = null

  try {
    // The editor shows its own toast when an upload fails, so just stop here
    const uploaded = await formFieldsRef.value?.flushPendingUploads()
    if (uploaded === false)
      return

    const { error } = await supabase
      .from('network_gameservers')
      .update({
        ...gameServerDetailsPayload(form.value),
        modified_at: new Date().toISOString(),
        modified_by: userId.value,
      })
      .eq('id', props.gameserver.id)

    if (error)
      throw error

    invalidateGameserversCache()
    open.value = false
    emit('saved')
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to update game server. Please try again.'
  }
  finally {
    saveLoading.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :size="fullscreen ? 'screen' : 'l'"
    scrollable
    :card="{ separators: true }"
    :can-dismiss="false"
    @close="open = false"
  >
    <template #header>
      <Flex x-between y-center expand>
        <Flex column :gap="0">
          <h4>Edit Game Server</h4>
          <p class="text-color-light text-xs">
            {{ props.gameserver.name }}
          </p>
        </Flex>
        <Tooltip>
          <Button plain square size="s" @click="fullscreen = !fullscreen">
            <Icon :name="fullscreen ? 'ph:arrows-in' : 'ph:arrows-out'" />
          </Button>
          <template #tooltip>
            <p>{{ fullscreen ? 'Collapse' : 'Expand' }}</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <GameServerDetailsFields
      ref="formFieldsRef"
      v-model="form"
      :gameserver-id="props.gameserver.id"
    />

    <p v-if="saveError" class="text-xs text-color-red">
      {{ saveError }}
    </p>

    <template #footer>
      <Flex gap="xs" x-between expand>
        <!-- Ports, query config and the container need the full admin form -->
        <NuxtLink :to="`/admin/network?tab=Gameservers&gameserver=${props.gameserver.id}`">
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
