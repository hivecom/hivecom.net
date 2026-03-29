<script setup lang="ts">
import type { Comment, ProvidedDiscussion } from './Discussion.types'
import { Button, ButtonGroup, Divider, Drawer, DropdownItem, Flex, Tooltip } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { DISCUSSION_KEYS } from './Discussion.keys'

interface Props {
  data: Comment
  userId: string | null | undefined
  currentUserData: { id: string, role: string | null } | null | undefined
  canBypassLock?: boolean
  canMarkOfftopic?: boolean
  offtopicLoading?: boolean
  loadingDeletion?: boolean
  pinnedLoading?: boolean
  showNSFWWarning?: boolean
  postedAt?: string
  editedAt?: string | null
  modifierId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  canBypassLock: false,
  canMarkOfftopic: false,
  offtopicLoading: false,
  loadingDeletion: false,
  pinnedLoading: false,
  showNSFWWarning: false,
  editedAt: null,
  modifierId: null,
})

const emit = defineEmits<{
  reply: []
  quote: []
  copyLink: []
  startEditing: []
  delete: []
  toggleOfftopic: []
  report: []
  openReplies: []
  togglePin: []
}>()

const isMobile = useBreakpoint('<s')
const sheetOpen = ref(false)

const discussion = inject(DISCUSSION_KEYS.discussion) as ProvidedDiscussion

const canInteract = computed(() =>
  (!discussion?.value?.is_locked || props.canBypassLock) && !discussion?.value?.is_archived,
)

const canEditOrDelete = computed(() =>
  !!props.currentUserData
  && (
    props.currentUserData.id === props.data.created_by
    || props.currentUserData.role === 'admin'
    || props.currentUserData.role === 'moderator'
  )
  && (!discussion?.value?.is_locked || props.canBypassLock)
  && !discussion?.value?.is_archived,
)

const canReport = computed(() =>
  !!props.currentUserData && props.data.created_by !== props.currentUserData.id,
)

const isPinned = computed(() =>
  discussion?.value?.pinned_reply_id === props.data.id,
)

const canPin = computed(() =>
  !!props.currentUserData
  && !!discussion?.value
  && !discussion.value.is_archived
  && (
    props.currentUserData.role === 'admin'
    || props.currentUserData.role === 'moderator'
    || props.currentUserData.id === discussion.value.created_by
  ),
)

const showModGroup = computed(() =>
  (props.canMarkOfftopic && (props.canBypassLock || props.userId !== props.data.created_by))
  || canReport.value,
)

function handleReply() {
  emit('reply')
  sheetOpen.value = false
}

function handleQuote() {
  emit('quote')
  sheetOpen.value = false
}

function handleCopyLink() {
  emit('copyLink')
  sheetOpen.value = false
}

function handleTogglePin() {
  emit('togglePin')
  sheetOpen.value = false
}

function handleStartEditing() {
  emit('startEditing')
  sheetOpen.value = false
}

function handleDelete() {
  emit('delete')
  sheetOpen.value = false
}

function handleToggleOfftopic() {
  emit('toggleOfftopic')
  sheetOpen.value = false
}

function handleReport() {
  emit('report')
  sheetOpen.value = false
}
</script>

<template>
  <!-- Mobile: three-dots button that opens a Sheet -->
  <template v-if="isMobile">
    <Button size="s" square plain class="discussion-toolbar__trigger" @click="sheetOpen = true">
      <Icon name="ph:dots-three-bold" :size="18" />
    </Button>

    <Drawer :open="sheetOpen" @close="sheetOpen = false">
      <!-- <template #header> -->
      <h4>Post actions</h4>
      <p v-if="postedAt" class="text-xs text-color-light">
        Posted {{ postedAt }}
        <template v-if="editedAt">
          &middot; Edited {{ editedAt }}
        </template>
      </p>

      <Divider :size="40" />

      <Flex column gap="xs" class="discussion-toolbar__sheet-actions">
        <!-- Interaction actions -->
        <template v-if="currentUserData && canInteract">
          <DropdownItem @click="handleReply">
            <template #icon>
              <Icon name="ph:arrow-elbow-up-left-bold" />
            </template>
            Reply
          </DropdownItem>
          <DropdownItem @click="handleQuote">
            <template #icon>
              <Icon name="ph:quotes-bold" />
            </template>
            Quote
          </DropdownItem>
        </template>

        <DropdownItem @click="handleCopyLink">
          <template #icon>
            <Icon name="ph:link-bold" />
          </template>
          Copy link
        </DropdownItem>

        <!-- Edit / delete (own post or mod) -->
        <template v-if="canEditOrDelete">
          <DropdownItem :inert="loadingDeletion" @click="handleStartEditing">
            <template #icon>
              <Icon name="ph:pen-bold" />
            </template>
            Edit post
          </DropdownItem>
          <DropdownItem expand variant="danger" :inert="loadingDeletion" :loading="loadingDeletion" @click="handleDelete">
            <template #icon>
              <Icon name="ph:trash-bold" class="text-color-red" />
            </template>
            Delete post
          </DropdownItem>
        </template>

        <Divider :size="32" />

        <!-- Off-topic + report -->
        <template v-if="showModGroup || canPin">
          <DropdownItem v-if="canPin" :inert="pinnedLoading" :loading="pinnedLoading" @click="handleTogglePin">
            <template #icon>
              <Icon :name="isPinned ? 'ph:push-pin-fill' : 'ph:push-pin-bold'" />
            </template>
            {{ isPinned ? 'Unpin reply' : 'Pin reply' }}
          </DropdownItem>
          <DropdownItem
            v-if="canMarkOfftopic && (canBypassLock || userId !== data.created_by)"

            outline
            expand
            variant="danger"
            :loading="offtopicLoading"
            @click="handleToggleOfftopic"
          >
            <template #icon>
              <Icon class="text-color-red" :name="data.is_offtopic ? 'ph:warning-circle-fill' : 'ph:warning-circle'" />
            </template>
            <span class="text-color-red">
              {{ data.is_offtopic ? 'Remove off-topic flag' : 'Mark as off-topic' }}
            </span>
          </DropdownItem>
          <DropdownItem v-if="canReport" outline expand variant="danger" @click="handleReport">
            <template #icon>
              <Icon class="text-color-red" name="ph:flag-bold" />
            </template>

            <span class="text-color-red">Report post</span>
          </DropdownItem>
        </template>
      </Flex>
    </Drawer>
  </template>

  <!-- Desktop: floating button group, shown on hover via CSS -->
  <template v-else>
    <div class="discussion-toolbar__desktop">
      <!-- Reactions select is handled by the parent since it needs the toggle fn;
           we only render the action groups here -->
      <slot name="reactions" />

      <ButtonGroup v-if="currentUserData">
        <template v-if="canInteract">
          <Button square size="s" @click="emit('reply')">
            <Tooltip>
              <Icon name="ph:arrow-elbow-up-left-bold" />
              <template #tooltip>
                <p>Reply</p>
              </template>
            </Tooltip>
          </Button>
          <Button square size="s" @click="emit('quote')">
            <Tooltip>
              <Icon name="ph:quotes-bold" />
              <template #tooltip>
                <p>Quote</p>
              </template>
            </Tooltip>
          </Button>
        </template>
        <Button size="s" square @click="emit('copyLink')">
          <Tooltip>
            <Icon name="ph:link-bold" />
            <template #tooltip>
              <p>Copy link</p>
            </template>
          </Tooltip>
        </Button>
      </ButtonGroup>

      <ButtonGroup v-if="canEditOrDelete">
        <Button size="s" square :inert="loadingDeletion" @click="emit('startEditing')">
          <Tooltip>
            <Icon name="ph:pen-bold" />
            <template #tooltip>
              <p>Edit post</p>
            </template>
          </Tooltip>
        </Button>
        <Button size="s" square :inert="loadingDeletion" :loading="loadingDeletion" @click="emit('delete')">
          <Tooltip>
            <Icon name="ph:trash-bold" />
            <template #tooltip>
              <p>Delete post</p>
            </template>
          </Tooltip>
        </Button>
      </ButtonGroup>

      <ButtonGroup v-if="showModGroup || canPin">
        <Button
          v-if="canPin"
          size="s"
          square
          :loading="pinnedLoading"
          :variant="isPinned ? 'accent' : 'gray'"
          @click="emit('togglePin')"
        >
          <Tooltip>
            <Icon :name="isPinned ? 'ph:push-pin-fill' : 'ph:push-pin-bold'" />
            <template #tooltip>
              <p>{{ isPinned ? 'Unpin reply' : 'Pin reply' }}</p>
            </template>
          </Tooltip>
        </Button>
        <Button
          v-if="canMarkOfftopic && (canBypassLock || userId !== data.created_by)"
          size="s"
          square
          :loading="offtopicLoading"
          :variant="data.is_offtopic ? 'danger' : 'gray'"
          @click="emit('toggleOfftopic')"
        >
          <Tooltip>
            <Icon :name="data.is_offtopic ? 'ph:warning-circle-fill' : 'ph:warning-circle'" />
            <template #tooltip>
              <p>{{ data.is_offtopic ? 'Remove off-topic flag' : 'Mark as off-topic' }}</p>
            </template>
          </Tooltip>
        </Button>
        <Button v-if="canReport" size="s" square @click="emit('report')">
          <Tooltip>
            <Icon name="ph:flag-bold" />
            <template #tooltip>
              <p>Report post</p>
            </template>
          </Tooltip>
        </Button>
      </ButtonGroup>
    </div>
  </template>
</template>

<style lang="scss" scoped>
.discussion-toolbar {
  &__trigger {
    flex-shrink: 0;
  }

  &__sheet-actions {
    display: block;
    padding-bottom: var(--space-m);

    hr:first-of-type {
      margin-bottom: -8px;
    }
  }

  &__desktop {
    display: flex;
    gap: 3px;
  }
}
</style>
