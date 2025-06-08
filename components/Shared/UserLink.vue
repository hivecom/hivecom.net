<script setup lang="ts">
import { CopyClipboard, Flex } from '@dolanske/vui'
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  userId: string | null
  placeholder?: string
}>()

const supabase = useSupabaseClient()
const currentUser = useSupabaseUser()
const username = ref<string | null>(null)
const loading = ref(true)
const error = ref(false)

// Fetch user profile data
async function fetchUserProfile() {
  if (!props.userId) {
    loading.value = false
    return
  }

  // Only fetch user profile if current user is authenticated
  if (!currentUser.value) {
    loading.value = false
    return
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', props.userId)
      .single()

    if (profileError) {
      throw profileError
    }

    username.value = profile?.username || null
  }
  catch (err) {
    console.error('Failed to fetch user profile:', err)
    error.value = true
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchUserProfile()
})

// Watch for authentication state changes
watch(currentUser, () => {
  fetchUserProfile()
}, { immediate: false })
</script>

<template>
  <!-- Only show content if user is authenticated -->
  <div v-if="!currentUser" class="user-display">
    {{ props.placeholder || 'Sign-in required' }}
  </div>

  <div v-else-if="!props.userId" class="user-display">
    {{ props.placeholder || 'None assigned' }}
  </div>

  <div v-else-if="loading" class="user-display">
    Loading...
  </div>

  <div v-else-if="error" class="user-display">
    <Flex gap="xs" x-center>
      <span class="error-text">Failed to load user</span>
      <CopyClipboard :text="props.userId" confirm>
        <Icon name="ph:copy" size="14" />
      </CopyClipboard>
    </Flex>
  </div>

  <div v-else class="user-display">
    <Flex gap="xs" x-center>
      <NuxtLink
        :to="`/profile/${props.userId}`"
        class="username-link"
        :aria-label="`View profile of ${username || 'user'}`"
      >
        {{ username || props.userId }}
      </NuxtLink>
      <CopyClipboard :text="props.userId" confirm>
        <Icon name="ph:copy" size="14" />
      </CopyClipboard>
    </Flex>
  </div>
</template>

<style scoped>
.user-display {
  display: inline-block;
}

.username-link {
  color: var(--color-primary);
  text-decoration: none;
  cursor: pointer;
}

.username-link:hover {
  text-decoration: underline;
}

.error-text {
  color: var(--color-error);
  font-size: 0.875rem;
}
</style>
