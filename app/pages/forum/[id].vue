<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, Card, Divider, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import Discussion from '@/components/Discussions/Discussion.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

// TODO: user preview card should have an option where avatar appears next to the name

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

useSeoMeta({
  title: computed(() => post.value ? `${post.value.title} | Forum` : 'post Details'),
  description: computed(() => post.value?.description || 'post details'),
  ogTitle: computed(() => post.value ? `${post.value.title} | Forum` : 'post Details'),
  ogDescription: computed(() => post.value?.description || 'Forum details'),
})
</script>

<template>
  <div class="page forum container container-m">
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
          class="mb-l"
          aria-label="Go back to Events page"
          @click="$router.back()"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back
        </Button>

        <h1>
          {{ post.title ?? 'Unnamed discussion' }}
        </h1>
        <p v-if="post.description">
          {{ post?.description }}
        </p>

        <Flex x-between y-center class="mt-l">
          <UserDisplay :user-id="post.created_by" show-role />
          <Flex gap="l" y-center>
            <span>
              <Icon :size="18" name="ph:eye" />
              {{ post.view_count }}</span>
            <span>
              <Icon :size="18" name="ph:chat-dots" />
              {{ post.reply_count }}
            </span>
            <!-- <Icon name="ph:dot-outline-fill" /> -->
            <span>Posted {{ dayjs(post.created_at).fromNow() }}</span>
            <span>Updated {{ dayjs(post.modified_at).fromNow() }}</span>
          </Flex>
        </Flex>
      </section>

      <Discussion
        :id="String(post.discussion_topic_id)"
        type="discussion_topic"
        model="forum"
        placeholder="Write your reply to this thread..."
        :input-rows="8"
      />
    </template>

    <!-- Nothing found or an error -->
    <Alert v-else variant="danger">
      {{ errorMessage ?? 'There was a problem loading the article' }}
    </Alert>
  </div>
</template>

<style scoped lang="scss">
.page-title {
  border-bottom: 1px solid var(--color-border);

  h1 {
    font-size: var(--font-size-xxxxl);
  }

  p {
    font-size: var(--font-size-xl);
  }

  span {
    color: var(--color-text-light);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-s);
  }
}
</style>
