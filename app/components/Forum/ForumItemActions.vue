<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Divider, Dropdown, DropdownItem, pushToast, Tooltip } from '@dolanske/vui'
import { useDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { slugify } from '@/lib/utils/formatting'
import ConfirmModal from '../Shared/ConfirmModal.vue'
import ForumModalAddDiscussion from './ForumModalAddDiscussion.vue'
import ForumModalAddTopic from './ForumModalAddTopic.vue'

const props = defineProps<Props>()

const emit = defineEmits<{
  update: [data: Props['data']]
  remove: [id: string]
}>()

const SLUG_DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

interface ModalControls {
  hideDiscussionTabs?: boolean
}

type Props
  = ModalControls & {
    table: 'discussion_topics'
    data: Tables<'discussion_topics'>
  } | ModalControls & {
    table: 'discussions'
    data: Tables<'discussions'>
  }

const dropdownRef = useTemplateRef('dropdownRef')
const supabase = useSupabaseClient()

const userId = useUserId()

const { user } = useDataUser(userId, { includeRole: true })
const discussionCache = useDiscussionCache()

// Locking
const lockLoading = ref(false)
const lockConfirm = ref(false)
const lockError = ref<string | null>(null)
const lockMode = ref<'lock' | 'unlock'>('lock')
const lockTarget = computed(() => props.table === 'discussions' ? 'discussion' : 'topic')
const lockTitle = computed(() => lockMode.value === 'lock'
  ? `Lock ${lockTarget.value}`
  : `Unlock ${lockTarget.value}`)
const lockDescription = computed(() => {
  if (lockMode.value === 'lock') {
    return props.table === 'discussions' && user.value?.role !== 'admin' && user.value?.role !== 'moderator'
      ? `Are you sure you want to lock this ${lockTarget.value}? Only admins and moderators will be able to unlock it.`
      : `Are you sure you want to lock this ${lockTarget.value}?`
  }
  return `Are you sure you want to unlock this ${lockTarget.value}?`
})

function handleLock(mode: 'lock' | 'unlock') {
  lockError.value = null
  lockLoading.value = true
  dropdownRef.value?.close()

  supabase
    .from(props.table)
    .update({ is_locked: mode === 'lock' })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      const itemType = props.table === 'discussions' ? 'discussion' : 'topic'
      const itemAction = mode === 'lock' ? 'locked' : 'unlocked'

      if (error) {
        lockError.value = error.message
        pushToast(`The ${itemType} could not be ${itemAction}`, {
          description: error.message,
        })
      }
      else {
        pushToast(`The ${itemType} has been ${itemAction}`)
        const updated = data[0] as Props['data']
        if (props.table === 'discussions') {
          discussionCache.set(updated as Tables<'discussions'>)
        }
        emit('update', updated)
        lockConfirm.value = false
      }

      lockLoading.value = false
    })
}

// Archive
const archiveLoading = ref(false)
const archiveConfirm = ref(false)
const archiveError = ref<string | null>(null)
const archiveMode = ref<'archive' | 'unarchive'>('archive')
const archiveTarget = computed(() => props.table === 'discussions' ? 'discussion' : 'topic')
const archiveTitle = computed(() => archiveMode.value === 'archive'
  ? `Archive ${archiveTarget.value}`
  : `Unarchive ${archiveTarget.value}`)
const archiveDescription = computed(() => {
  if (archiveMode.value === 'archive') {
    return `Are you sure you want to archive this ${archiveTarget.value}?`
  }
  return `Are you sure you want to unarchive this ${archiveTarget.value}?`
})

function handleArchive(mode: 'archive' | 'unarchive') {
  archiveError.value = null
  archiveLoading.value = true

  const isArchived = mode === 'archive'
  const itemType = props.table === 'discussions' ? 'discussion' : 'topic'

  supabase
    .from(props.table)
    .update({ is_archived: isArchived })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      if (error) {
        archiveError.value = error.message
      }
      else {
        pushToast(`Successfully ${isArchived ? 'archived' : 'unarchived'} ${itemType}`)
        const updated = data[0] as Props['data']
        if (props.table === 'discussions') {
          discussionCache.set(updated as Tables<'discussions'>)
        }
        emit('update', updated)
        archiveConfirm.value = false
      }

      archiveLoading.value = false
    })
}

function handleStick(mode: 'stick' | 'unstick') {
  dropdownRef.value?.close()

  supabase
    .from('discussions')
    .update({ is_sticky: !(props.data as Tables<'discussions'>).is_sticky })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      if (error) {
        pushToast('Error updating discussion', { description: error.message })
      }
      else {
        if (mode === 'stick') {
          pushToast('Successfully pinned discussion')
        }
        else {
          pushToast('Successfully unpinned discussion')
        }

        const updated = data[0] as Tables<'discussions'>
        discussionCache.set(updated)
        emit('update', updated)
      }
    })
}

// Editing
const showEditModal = ref(false)
const showCreateSubTopicModal = ref(false)
const showCreateDiscussionModal = ref(false)
// function handleEdit() {}

const linkedDiscussionReason = computed(() => {
  if (props.table !== 'discussions')
    return null

  const discussion = props.data as Tables<'discussions'>
  const isLinked = Boolean(
    discussion.event_id
    || discussion.gameserver_id
    || discussion.project_id
    || discussion.profile_id
    || discussion.referendum_id,
  )

  return isLinked ? 'This discussion is linked to an entity and cannot be re-created or deleted.' : null
})

// Re-create
const recreateConfirm = ref(false)
const recreateLoading = ref(false)

const recreateDescription = computed(() => {
  if (props.table !== 'discussions')
    return ''
  const discussion = props.data as Tables<'discussions'>
  const created = new Date(discussion.created_at)
  const suffix = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`
  return `This will lock, unpin, and archive "${discussion.title ?? 'this discussion'}" - renaming its slug with a ${suffix}- prefix - then create a fresh discussion with the same title, description, and content. This cannot be undone.`
})

async function handleRecreate() {
  if (props.table !== 'discussions')
    return

  recreateLoading.value = true
  dropdownRef.value?.close()

  const discussion = props.data as Tables<'discussions'>

  // Build the YYYY-MM-DD suffix from the discussion's creation date
  const created = new Date(discussion.created_at)
  const suffix = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`

  const oldTitle = discussion.title ?? 'Untitled'
  const archivedTitle = `${oldTitle} (${suffix})`
  const baseSlug = discussion.slug ?? slugify(oldTitle)
  // Strip any existing YYYY-MM-DD prefix from the slug before prepending
  const cleanSlug = baseSlug.replace(SLUG_DATE_PREFIX_RE, '')
  const archivedSlugBase = `${suffix}-${cleanSlug}`

  // Resolve a free archived slug - append -2, -3, etc. on conflict
  let archivedSlug = archivedSlugBase
  {
    let counter = 1
    while (true) {
      const { data: existing } = await supabase
        .from('discussions')
        .select('id')
        .eq('slug', archivedSlug)
        .neq('id', discussion.id)
        .limit(1)
      if (!existing || existing.length === 0)
        break
      counter++
      archivedSlug = `${archivedSlugBase}-${counter}`
    }
  }

  // Resolve a free slug for the new discussion - the original slug may already
  // be taken if this discussion was previously re-created
  let newSlug = baseSlug
  {
    let counter = 1
    while (true) {
      const { data: existing } = await supabase
        .from('discussions')
        .select('id')
        .eq('slug', newSlug)
        .limit(1)
      if (!existing || existing.length === 0)
        break
      counter++
      newSlug = `${baseSlug}-${counter}`
    }
  }

  try {
    // 1. Update the old discussion: lock, unsticky, archive, rename
    const { data: archivedData, error: archiveError } = await supabase
      .from('discussions')
      .update({
        is_locked: true,
        is_sticky: false,
        is_archived: true,
        title: archivedTitle,
        slug: archivedSlug,
      })
      .eq('id', discussion.id)
      .select()
      .single()

    if (archiveError) {
      pushToast('Failed to archive the original discussion', { description: archiveError.message })
      recreateLoading.value = false
      return
    }

    // Invalidate the old slug key now that the slug has changed - the old URL
    // should no longer serve a cache hit for the pre-rename data.
    discussionCache.invalidate(discussion.id, discussion.slug)
    // Warm the cache with the renamed archived record so /forum/YYYY-MM-DD-slug
    // is a cache hit if someone navigates there.
    discussionCache.set(archivedData)

    // 2. Create the new discussion with the original title, description, content and topic
    const { data: newData, error: createError } = await supabase
      .from('discussions')
      .insert({
        title: oldTitle,
        slug: newSlug,
        description: discussion.description,
        markdown: discussion.markdown,
        discussion_topic_id: discussion.discussion_topic_id,
        is_draft: false,
        is_locked: false,
        is_sticky: false,
        is_archived: false,
        is_nsfw: discussion.is_nsfw ?? false,
      })
      .select()
      .single()

    if (createError) {
      pushToast('Failed to create the new discussion', { description: createError.message })
      recreateLoading.value = false
      return
    }

    // Warm the cache with the new discussion so the navigation below is an
    // immediate cache hit rather than a fresh DB round-trip.
    discussionCache.set(newData)

    pushToast(`Re-created discussion "${oldTitle}"`)
    emit('update', props.data)
    recreateConfirm.value = false
    recreateLoading.value = false

    await navigateTo(`/forum/${newData.slug ?? newData.id}`)
  }
  catch {
    recreateLoading.value = false
  }
}

// Delete
const deleteLoading = ref(false)
const deleteConfirm = ref(false)
const deletengError = ref<string | null>(null)

function handleDelete() {
  deletengError.value = null
  deleteLoading.value = true

  supabase
    .from(props.table)
    .delete()
    .eq('id', props.data.id)
    .then(({ error }) => {
      if (error) {
        deletengError.value = error.message
      }
      else {
        emit('remove', props.data.id)
        deleteConfirm.value = false
      }

      deleteLoading.value = false
    })
}
</script>

<template>
  <div v-if="user && (user.id === data.created_by || user.role === 'admin' || user.role === 'moderator')" class="forum__item-actions">
    <Dropdown ref="dropdownRef">
      <template #trigger="{ toggle, isOpen }">
        <slot :toggle>
          <Button size="s" plain square :class="{ 'has-active-dropdown': isOpen }" @click.stop.prevent="toggle">
            <Icon name="ph:dots-three-outline-fill" />
          </Button>
        </slot>
      </template>
      <!-- Locking - topic & discussion  -->
      <!-- Unlock is restricted to admins/moderators; authors can only lock -->
      <DropdownItem
        v-if="props.data.is_locked && (user?.role === 'admin' || user?.role === 'moderator')"
        @click="lockMode = 'unlock'; lockConfirm = true"
      >
        Unlock
      </DropdownItem>
      <DropdownItem v-else-if="!props.data.is_locked" @click="lockMode = 'lock'; lockConfirm = true">
        Lock
      </DropdownItem>

      <!-- Archiving - topics & discussions -->
      <DropdownItem
        v-if="!props.data.is_archived"
        @click="archiveMode = 'archive'; archiveConfirm = true"
      >
        Archive
      </DropdownItem>
      <DropdownItem
        v-if="props.data.is_archived"
        @click="archiveMode = 'unarchive'; archiveConfirm = true"
      >
        Unarchive
      </DropdownItem>

      <!-- Sticking discussions -->
      <template v-if="props.table === 'discussions'">
        <DropdownItem v-if="props.data.is_sticky" @click="handleStick('unstick')">
          Unpin
        </DropdownItem>
        <DropdownItem v-else @click="handleStick('stick')">
          Pin
        </DropdownItem>
      </template>
      <Divider :size="0" margin="8px 0" />
      <DropdownItem @click="showEditModal = true">
        Edit
      </DropdownItem>
      <!-- Re-create - discussions only, admin/mod only, blocked for entity-linked discussions -->
      <template v-if="props.table === 'discussions' && (user?.role === 'admin' || user?.role === 'moderator')">
        <template v-if="linkedDiscussionReason">
          <Tooltip placement="left">
            <template #tooltip>
              <p>{{ linkedDiscussionReason }}</p>
            </template>
            <DropdownItem class="forum__item-actions-disabled" @click.stop.prevent>
              Re-create
            </DropdownItem>
          </Tooltip>
        </template>
        <DropdownItem v-else @click="recreateConfirm = true; dropdownRef?.close()">
          Re-create
        </DropdownItem>
      </template>
      <!-- Topic-only: create sub-topic and create discussion shortcuts -->
      <template v-if="props.table === 'discussion_topics'">
        <Divider :size="0" margin="8px 0" />
        <DropdownItem
          v-if="!props.data.is_locked || user?.role === 'admin' || user?.role === 'moderator'"
          @click="showCreateSubTopicModal = true; dropdownRef?.close()"
        >
          Create sub-topic
        </DropdownItem>
        <DropdownItem
          v-if="!props.data.is_locked || user?.role === 'admin' || user?.role === 'moderator'"
          @click="showCreateDiscussionModal = true; dropdownRef?.close()"
        >
          Create discussion
        </DropdownItem>
      </template>
      <template v-if="props.table === 'discussions' && linkedDiscussionReason">
        <Tooltip placement="left">
          <template #tooltip>
            <p>{{ linkedDiscussionReason }}</p>
          </template>
          <DropdownItem class="forum__item-actions-disabled" @click.stop.prevent>
            Delete
          </DropdownItem>
        </Tooltip>
      </template>
      <DropdownItem v-else @click="deleteConfirm = true">
        Delete
      </DropdownItem>
    </Dropdown>

    <!-- Confirmation modal for locking -->
    <ConfirmModal
      v-model:open="lockConfirm"
      :confirm-loading="lockLoading"
      :title="lockTitle"
      :description="lockDescription"
      @confirm="handleLock(lockMode)"
    >
      <Alert v-if="lockError">
        {{ lockError }}
      </Alert>
    </ConfirmModal>

    <!-- Confirmation modal for archiving & deletion -->
    <!-- @confirm="handleArchive" -->
    <ConfirmModal
      v-model:open="archiveConfirm"
      :confirm-loading="archiveLoading"
      :title="archiveTitle"
      :description="archiveDescription"
      @confirm="handleArchive(archiveMode)"
    >
      <Alert v-if="archiveError">
        {{ archiveError }}
      </Alert>
    </ConfirmModal>

    <!-- Confirmation modal for re-create -->
    <ConfirmModal
      v-model:open="recreateConfirm"
      :confirm-loading="recreateLoading"
      destructive
      confirm-text="Re-create"
      title="Re-create discussion"
      :description="recreateDescription"
      @confirm="handleRecreate"
    />

    <ConfirmModal
      v-model:open="deleteConfirm"
      :confirm-loading="deleteLoading"
      title="Remove"
      description="Are you sure you want to delete this item? This action cannot be undone"
      @confirm="handleDelete"
    />

    <!-- Editing modals -->
    <ForumModalAddTopic
      v-if="props.table === 'discussion_topics'"
      :open="showEditModal"
      :edited-item="props.data"
      @close="showEditModal = false"
      @created="emit('update', $event)"
    />

    <ForumModalAddDiscussion
      v-else
      :open="showEditModal"
      :edited-item="props.data"
      :hide-tabs="props.hideDiscussionTabs ?? false"
      @close="showEditModal = false"
      @created="emit('update', $event)"
    />

    <!-- Create sub-topic modal (only for topics) -->
    <ForumModalAddTopic
      v-if="props.table === 'discussion_topics'"
      :open="showCreateSubTopicModal"
      :default-parent-id="props.data.id"
      @close="showCreateSubTopicModal = false"
      @created="emit('update', $event)"
    />

    <!-- Create discussion modal (only for topics) -->
    <ForumModalAddDiscussion
      v-if="props.table === 'discussion_topics'"
      :open="showCreateDiscussionModal"
      :default-topic-id="props.data.id"
      hide-tabs
      @close="showCreateDiscussionModal = false"
      @created="emit('update', $event)"
    />
  </div>
</template>

<style scoped>
.forum__item-actions-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
