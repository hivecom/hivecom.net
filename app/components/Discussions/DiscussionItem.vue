<script setup lang="ts">
import type { Comment } from './Discussion.vue'
import { pushToast } from '@dolanske/vui'
import { scrollToId } from '@/lib/utils/common'
import DiscussionModelComment from './models/DiscussionModelComment.vue'
import DiscussionModelForum from './models/DiscussionModelForum.vue'

interface Props {
  data: Comment
  model?: 'comment' | 'forum'
}

const {
  data,
  model,
} = defineProps<Props>()

const self = useTemplateRef('self')
const route = useRoute()
const router = useRouter()

// Scroll to itself when mounted and the query id matches
const isActive = computed(() => data.id === route.query.comment)

onMounted(() => {
  if (isActive.value) {
    self.value?.$el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

// Copy link to item
const { copy } = useClipboard()

function copyLink() {
  const url = new URL(window.location.href)
  url.searchParams.set('comment', data.id)
  copy(url.toString())
  pushToast('Link copied to clipboard', {
    timeout: 1500,
  })
}

// Scroll to reply
function scrollReply() {
  if (!data.reply) {
    return
  }

  router.replace({ query: { comment: data.reply.id } })
  scrollToId(`#comment-${data.reply.id}`)
}
</script>

<template>
  <div :id="`comment-${data.id}`" class="discussion-comment-wrapper">
    <DiscussionModelComment v-if="model === 'comment'" ref="self" :data :class="{ 'discussion-comment--highlight': isActive }" @copy-link="copyLink" @scroll-reply="scrollReply" />
    <DiscussionModelForum v-else ref="self" :data :class="{ 'discussion-forum--highlight': isActive }" @copy-link="copyLink" @scroll-reply="scrollReply" />
  </div>
</template>

<style scoped lang="scss">
.discussion-comment-wrapper {
  display: block;
}
</style>
