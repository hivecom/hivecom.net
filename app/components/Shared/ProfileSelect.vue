<script setup lang="ts">
import { Button, Dropdown, DropdownItem, DropdownTitle, Flex, Input, Spinner } from '@dolanske/vui'
import { onMounted, ref, watch } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

interface Props {
  modelValue: string | null
  placeholder?: string
  expand?: boolean
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Select administrator',
  expand: false,
  clearable: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

interface ProfileResult {
  id: string
  username: string
}

const supabase = useSupabaseClient()
const searchQuery = ref('')
const results = ref<ProfileResult[]>([])
const loading = ref(false)
const selectedProfile = ref<ProfileResult | null>(null)

const hasValue = ref(false)
watch(() => props.modelValue, (val) => {
  hasValue.value = !!val
}, { immediate: true })

async function fetchProfiles(query: string) {
  loading.value = true
  try {
    let req = supabase
      .from('profiles')
      .select('id, username')
      .order('username')
      .limit(20)

    if (query.trim())
      req = req.ilike('username', `%${query.trim()}%`)

    const { data, error } = await req
    if (error)
      throw error
    results.value = (data ?? []) as ProfileResult[]
  }
  catch (err) {
    console.error('ProfileSelect: failed to fetch profiles', err)
  }
  finally {
    loading.value = false
  }
}

async function fetchProfileById(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', id)
    .single()

  if (!error && data) {
    selectedProfile.value = data as ProfileResult
    // Ensure it appears in the list too
    if (!results.value.some(r => r.id === id))
      results.value = [data as ProfileResult, ...results.value]
  }
}

// Debounce timer for search
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (query) => {
  if (debounceTimer !== null)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fetchProfiles(query)
  }, 300)
})

// When modelValue changes to a non-null value, make sure we know the profile name
watch(() => props.modelValue, async (val) => {
  if (!val) {
    selectedProfile.value = null
    return
  }
  if (selectedProfile.value?.id === val)
    return
  // Check results first
  const found = results.value.find(r => r.id === val)
  if (found) {
    selectedProfile.value = found
  }
  else {
    await fetchProfileById(val)
  }
}, { immediate: false })

onMounted(async () => {
  await fetchProfiles('')
  if (props.modelValue) {
    const found = results.value.find(r => r.id === props.modelValue)
    if (found) {
      selectedProfile.value = found
    }
    else {
      await fetchProfileById(props.modelValue)
    }
  }
})

function selectProfile(profile: ProfileResult) {
  selectedProfile.value = profile
  emit('update:modelValue', profile.id)
}

function clearSelection() {
  selectedProfile.value = null
  emit('update:modelValue', null)
}
</script>

<template>
  <Dropdown :expand="expand">
    <template #trigger="{ toggle, isOpen: dropdownOpen }">
      <button
        type="button"
        class="profile-select-trigger"
        :class="{
          'profile-select-trigger--expand': expand,
          'profile-select-trigger--has-value': !!modelValue,
          'profile-select-trigger--open': dropdownOpen,
        }"
        @click="toggle"
      >
        <span class="profile-select-trigger__content">
          <UserAvatar v-if="modelValue" :user-id="modelValue" :size="22" />
          <span class="profile-select-trigger__label">
            <template v-if="modelValue && selectedProfile">{{ selectedProfile.username }}</template>
            <template v-else-if="modelValue">Loading...</template>
            <template v-else>{{ placeholder }}</template>
          </span>
        </span>
        <span class="profile-select-trigger__actions">
          <Button
            v-if="clearable && modelValue"
            plain
            square
            size="s"
            @click.stop="clearSelection"
          >
            <Icon name="ph:x" :size="18" />
          </Button>
          <Icon :name="dropdownOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="14" class="profile-select-trigger__caret" />
        </span>
      </button>
    </template>

    <template #default>
      <DropdownTitle>
        <Input v-model="searchQuery" placeholder="Search..." expand focus />
      </DropdownTitle>

      <DropdownItem v-if="loading" disabled>
        <Spinner size="s" />
      </DropdownItem>

      <DropdownItem
        v-else-if="!loading && results.length === 0"
        disabled
      >
        No results
      </DropdownItem>

      <DropdownItem
        v-for="profile in results"
        v-else
        :key="profile.id"
        @click="selectProfile(profile)"
      >
        <template #icon>
          <UserAvatar :user-id="profile.id" :size="22" />
        </template>
        <Flex y-center gap="xs">
          {{ profile.username }}
        </Flex>
        <template v-if="modelValue === profile.id" #iconEnd>
          <Icon name="ph:check" />
        </template>
      </DropdownItem>
    </template>
  </Dropdown>
</template>

<style scoped lang="scss">
.profile-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
  height: var(--interactive-el-height);
  min-width: 96px;
  padding-inline: var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg-card);
  cursor: pointer;
  font-size: var(--font-size-m);
  color: var(--color-text-lighter);
  transition: border-color var(--transition-fast);
  white-space: nowrap;

  &:hover {
    border-color: var(--color-border-strong);
  }

  &--open {
    outline: 2px solid var(--color-text);
    outline-offset: -1px;
  }

  &--expand {
    width: 100%;
  }

  &--has-value {
    color: var(--color-text);
    font-weight: var(--font-weight-medium);
  }

  &__content {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    overflow: hidden;
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  &__caret {
    color: var(--color-text-lighter);
    flex-shrink: 0;
  }
}
</style>
