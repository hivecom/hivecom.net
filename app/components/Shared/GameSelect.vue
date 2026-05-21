<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Dropdown, DropdownItem, DropdownTitle, Input, searchString, Spinner } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import GameIcon from '@/components/Shared/GameIcon.vue'

interface Props {
  games: Tables<'games'>[]
  modelValue: number[]
  placeholder?: string
  expand?: boolean
  clearable?: boolean
  size?: 's' | 'm'
  loading?: boolean
  onSearch?: (query: string) => void
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Select game',
  expand: false,
  clearable: true,
  size: 'm',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void
}>()

const searchQuery = ref('')

// When onSearch is provided, parent controls the list - just return props.games as-is.
// When onSearch is not provided, filter locally.
const filteredGames = computed(() => {
  if (props.onSearch)
    return props.games
  if (!searchQuery.value)
    return props.games
  const query = searchQuery.value.toLowerCase()
  return props.games.filter(game =>
    searchString([game.name ?? '', game.shorthand ?? ''], query),
  )
})

// Debounce timer for external search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (query) => {
  if (!props.onSearch)
    return
  if (searchDebounceTimer !== null)
    clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    props.onSearch!(query)
  }, 300)
})

const selectedGame = computed(() =>
  props.modelValue.length === 1
    ? props.games.find(g => g.id === props.modelValue[0])
    : null,
)

const hasValue = computed(() => props.modelValue.length > 0)

function toggleGame(id: number) {
  if (props.modelValue.includes(id)) {
    emit('update:modelValue', props.modelValue.filter(v => v !== id))
  }
  else {
    emit('update:modelValue', [...props.modelValue, id])
  }
}

function clearSelection() {
  emit('update:modelValue', [])
}
</script>

<template>
  <Dropdown :expand="expand">
    <template #trigger="{ toggle, isOpen: dropdownOpen }">
      <button
        type="button"
        class="game-select-trigger"
        :class="{ 'game-select-trigger--expand': expand,
                  'game-select-trigger--has-value': hasValue,
                  'game-select-trigger--open': dropdownOpen }"
        @click="toggle"
      >
        <span class="game-select-trigger__content">
          <GameIcon v-if="modelValue.length === 1 && selectedGame" :game="selectedGame" size="xs" />
          <span class="game-select-trigger__label">
            <template v-if="modelValue.length === 0">{{ placeholder }}</template>
            <template v-else-if="modelValue.length === 1 && selectedGame">{{ selectedGame.name ?? selectedGame.shorthand }}</template>
            <template v-else>{{ modelValue.length }} games</template>
          </span>
        </span>
        <span class="game-select-trigger__actions">
          <Button
            v-if="clearable && hasValue"
            plain
            square
            size="s"
            @click.stop="clearSelection"
          >
            <Icon name="ph:x" :size="18" />
          </Button>
          <Icon :name="dropdownOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="14" class="game-select-trigger__caret" />
        </span>
      </button>
    </template>

    <template #default>
      <DropdownTitle>
        <Input v-model="searchQuery" placeholder="Search..." expand focus />
      </DropdownTitle>

      <DropdownItem v-if="loading && filteredGames.length === 0" disabled>
        <Spinner size="s" />
      </DropdownItem>

      <DropdownItem
        v-for="game in filteredGames"
        :key="game.id"
        @click="toggleGame(game.id)"
      >
        <template #icon>
          <GameIcon :game="game" size="xs" />
        </template>
        {{ game.name ?? game.shorthand }}
        <template v-if="modelValue.includes(game.id)" #iconEnd>
          <Icon name="ph:check" />
        </template>
      </DropdownItem>
    </template>
  </Dropdown>
</template>

<style scoped lang="scss">
.game-select-trigger {
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
