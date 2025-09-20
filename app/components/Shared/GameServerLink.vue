<script setup lang="ts">
import { CopyClipboard, Flex } from '@dolanske/vui'
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  gameserverId: number | null
  placeholder?: string
}>()

const supabase = useSupabaseClient()
const currentUser = useSupabaseUser()
const gameserverName = ref<string | null>(null)
const loading = ref(true)
const error = ref(false)

// Fetch gameserver data
async function fetchGameserver() {
  if (!props.gameserverId) {
    loading.value = false
    return
  }

  // Only fetch gameserver if current user is authenticated
  if (!currentUser.value) {
    loading.value = false
    return
  }

  try {
    const { data: gameserver, error: gameserverError } = await supabase
      .from('gameservers')
      .select('name')
      .eq('id', props.gameserverId)
      .single()

    if (gameserverError) {
      throw gameserverError
    }

    gameserverName.value = gameserver?.name || null
  }
  catch (err) {
    console.error('Failed to fetch gameserver:', err)
    error.value = true
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchGameserver()
})

// Watch for authentication state changes
watch(currentUser, () => {
  fetchGameserver()
}, { immediate: false })
</script>

<template>
  <!-- Only show content if user is authenticated -->
  <div v-if="!currentUser" class="gameserver-display">
    {{ props.placeholder || 'Sign-in required' }}
  </div>

  <div v-else-if="!props.gameserverId" class="gameserver-display">
    {{ props.placeholder || 'None assigned' }}
  </div>

  <div v-else-if="loading" class="gameserver-display">
    Loading...
  </div>

  <div v-else-if="error" class="gameserver-display">
    <Flex gap="xs" x-center>
      <span class="text-xs color-error">Failed to load gameserver</span>
      <CopyClipboard :text="props.gameserverId?.toString() || ''" confirm>
        <Icon name="ph:copy" size="14" />
      </CopyClipboard>
    </Flex>
  </div>

  <div v-else class="gameserver-display">
    <Flex gap="xs" y-center>
      <NuxtLink
        :to="`/gameservers/${props.gameserverId}`"
        class="gameserver-link text-s"
        :aria-label="`View gameserver ${gameserverName || 'details'}`"
      >
        {{ gameserverName || `Gameserver #${props.gameserverId}` }}
      </NuxtLink>
      <CopyClipboard :text="props.gameserverId?.toString() || ''" confirm>
        <Icon name="ph:copy" size="14" />
      </CopyClipboard>
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.gameserver-display {
  display: inline-block;
}

.gameserver-link {
  color: var(--color-primary);
  text-decoration: none;
  cursor: pointer;
}

.gameserver-link:hover {
  text-decoration: underline;
}
</style>
