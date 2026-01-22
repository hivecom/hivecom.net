<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'

const route = useRoute()

const supabase = useSupabaseClient()
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const post = ref<Tables<'discussions'> | null>(null)

onBeforeMount(() => {
  loading.value = true

  supabase
    .from('discussions')
    .select('*')
    .eq('id', route.params.id)
    .single()
    .then(({ data, error }) => {
      if (error) {
        errorMessage.value = error.message
      }
      else {
        post.value = data
      }

      loading.value = false
    })
})
</script>

<template>
  <div class="page forum">
    <!-- Loading state -->
    <template v-if="loading">
      <h1>Loading shit add skeleton</h1>
    </template>

    <!-- Main Content  -->
    <template v-else-if="post">
      <section class="page-title mb-xl">
        <Button
          variant="gray"
          plain
          size="s"
          aria-label="Go back to Events page"
          class="mb-l"
          @click="$router.push('/events')"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Events
        </Button>

        <h1>
          {{ post.title ?? 'Unnamed discussion' }}
        </h1>
        <p v-if="post.description">
          {{ post?.description }}
        </p>
      </section>

      <Discussion
        :id="post.id"
        type="discussion_topic"
        model="forum"
      />
    </template>

    <!-- Nothing found or an error -->
    <Alert v-else variant="danger">
      {{ errorMessage ?? 'There was a problem loading the article' }}
    </Alert>
  </div>
</template>
