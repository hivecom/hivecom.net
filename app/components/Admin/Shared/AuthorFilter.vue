<script setup lang="ts">
import { Button, Input } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { ref, watch } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

interface ProfileResult {
  id: string
  username: string
}

const selectedAuthor = defineModel<ProfileResult | null>({ default: null })

const supabase = useSupabaseClient()

const query = ref('')
const results = ref<ProfileResult[]>([])
const loading = ref(false)
const open = ref(false)
const focusedIndex = ref(-1)
const dropdownRef = ref<HTMLElement | null>(null)

// When the parent clears the model externally (e.g. clearFilters), clear the input too
watch(selectedAuthor, (author) => {
  if (author === null && query.value !== '') {
    query.value = ''
    results.value = []
    open.value = false
    focusedIndex.value = -1
  }
})

async function search(term: string) {
  if (term.trim() === '') {
    results.value = []
    open.value = false
    focusedIndex.value = -1
    return
  }

  loading.value = true
  try {
    const { data, error } = await supabase
      .rpc('search_profiles', { search_term: term })
      .select('id, username')
      .limit(10)

    if (error)
      throw error

    results.value = (data ?? []) as ProfileResult[]
    open.value = results.value.length > 0
    focusedIndex.value = -1
  }
  catch {
    results.value = []
    open.value = false
  }
  finally {
    loading.value = false
  }
}

watchDebounced(query, (val) => {
  // If the query exactly matches the confirmed selection, don't re-search
  if (selectedAuthor.value !== null && val === selectedAuthor.value.username)
    return

  // If the user edits the input after confirming a selection, reset the model
  if (selectedAuthor.value !== null)
    selectedAuthor.value = null

  void search(val)
}, { debounce: 250 })

function select(profile: ProfileResult) {
  selectedAuthor.value = profile
  query.value = profile.username
  open.value = false
  results.value = []
  focusedIndex.value = -1
}

function clear() {
  selectedAuthor.value = null
  query.value = ''
  results.value = []
  open.value = false
  focusedIndex.value = -1
}

function onBlur(e: FocusEvent) {
  const related = e.relatedTarget as HTMLElement | null
  if (dropdownRef.value?.contains(related))
    return
  open.value = false
  focusedIndex.value = -1
}

function onFocus() {
  if (results.value.length > 0)
    open.value = true
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) {
    if (e.key === 'ArrowDown' && results.value.length > 0) {
      open.value = true
      focusedIndex.value = 0
      e.preventDefault()
      e.stopPropagation()
    }
    else if (e.key === 'Enter') {
      // Always swallow Enter when the input is focused to prevent page navigation
      e.preventDefault()
      e.stopPropagation()
    }
    return
  }

  if (e.key === 'ArrowDown') {
    focusedIndex.value = Math.min(focusedIndex.value + 1, results.value.length - 1)
    e.preventDefault()
    e.stopPropagation()
  }
  else if (e.key === 'ArrowUp') {
    focusedIndex.value = Math.max(focusedIndex.value - 1, -1)
    e.preventDefault()
    e.stopPropagation()
  }
  else if (e.key === 'Enter' || e.key === 'Tab') {
    const target = focusedIndex.value >= 0
      ? results.value[focusedIndex.value]
      : results.value[0]
    if (target) {
      select(target)
    }
    else {
      open.value = false
    }
    e.preventDefault()
    e.stopPropagation()
  }
  else if (e.key === 'Escape') {
    open.value = false
    focusedIndex.value = -1
    e.preventDefault()
    e.stopPropagation()
  }
}
</script>

<template>
  <Input
    v-model="query"
    expand
    placeholder="Filter by author..."
    :loading="loading"
    autocomplete="off"
    @blur="onBlur"
    @focus="onFocus"
    @keydown="onKeydown"
  >
    <template #start>
      <Icon name="ph:user" />
    </template>
    <template v-if="selectedAuthor" #end>
      <Button variant="gray" plain square size="s" @mousedown.prevent="clear">
        <Icon name="ph:x" size="14" />
      </Button>
    </template>
  </Input>

  <div
    v-if="open"
    ref="dropdownRef"
    class="author-filter-dropdown"
    @mousedown.prevent
  >
    <button
      v-for="(profile, index) in results"
      :key="profile.id"
      class="author-filter-option"
      :class="{ 'is-focused': focusedIndex === index }"
      type="button"
      @click="select(profile)"
      @mouseenter="focusedIndex = index"
    >
      <UserAvatar :user-id="profile.id" :size="22" />
      <span>{{ profile.username }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.author-filter-dropdown {
  position: absolute;
  top: calc(100% + var(--space-xxs));
  left: 0;
  min-width: 100%;
  background-color: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: var(--z-popout);
  overflow: hidden;
}

.author-filter-option {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-xs) var(--space-s);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: var(--color-text);
  font-size: var(--font-size-s);
  transition: background-color var(--transition-fast);

  &.is-focused {
    background-color: var(--color-bg-medium);
    outline: none;
  }
}
</style>
