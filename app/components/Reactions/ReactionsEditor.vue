<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ReactionsSelect from '@/components/Reactions/ReactionsSelect.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

// Editable strip of emoji chips: add from the reaction picker, click to remove,
// drag to reorder. Drives a string[] via v-model. Pass `defaults` to enable the
// reset action (omit it to hide reset entirely).
const props = withDefaults(defineProps<{
  modelValue: string[]
  max?: number
  defaults?: string[]
}>(), {
  max: 10,
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const atMax = computed(() => props.modelValue.length >= props.max)

function add(emote: string) {
  if (props.modelValue.includes(emote) || props.modelValue.length >= props.max)
    return
  emit('update:modelValue', [...props.modelValue, emote])
}

function remove(emote: string) {
  emit('update:modelValue', props.modelValue.filter(e => e !== emote))
}

// Drag-to-reorder. Native HTML5 drag, matching the file-drop pattern used
// elsewhere - the list is short so a sortable library isn't worth it. A real
// drag suppresses the click, so click-to-remove still works.
const draggingIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
  draggingIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox won't start a drag unless some data is set.
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragEnter(index: number) {
  const from = draggingIndex.value
  if (from === null || from === index)
    return
  const next = [...props.modelValue]
  const [moved] = next.splice(from, 1)
  next.splice(index, 0, moved!)
  emit('update:modelValue', next)
  draggingIndex.value = index
}

function onDragEnd() {
  draggingIndex.value = null
}

const resetConfirmOpen = ref(false)

function applyDefaults() {
  emit('update:modelValue', [...(props.defaults ?? [])])
}

function reset() {
  // Nothing to overwrite, so just restore the defaults. Otherwise confirm first.
  if (props.modelValue.length === 0)
    applyDefaults()
  else
    resetConfirmOpen.value = true
}
</script>

<template>
  <Flex gap="xs" wrap y-center>
    <button
      v-for="(emote, index) in modelValue"
      :key="emote"
      type="button"
      class="reaction-chip"
      :class="{ 'reaction-chip--dragging': draggingIndex === index }"
      draggable="true"
      aria-label="Remove reaction"
      @click="remove(emote)"
      @dragstart="onDragStart(index, $event)"
      @dragenter.prevent="onDragEnter(index)"
      @dragover.prevent
      @dragend="onDragEnd"
    >
      {{ emote }}
    </button>
    <ReactionsSelect :quick="false" @reaction="add">
      <template #default="{ toggle }">
        <button
          type="button"
          class="reaction-chip reaction-chip--add"
          :disabled="atMax"
          :aria-label="atMax ? `Maximum ${max} reactions reached` : 'Add reaction'"
          :title="atMax ? `Maximum ${max} reached - remove one to add another` : 'Add reaction'"
          @click="toggle"
        >
          <Icon name="ph:plus" :size="18" />
        </button>
      </template>
    </ReactionsSelect>
    <span class="text-xs reaction-chip__count" :class="atMax ? 'text-color-light' : 'text-color-lighter'">
      {{ modelValue.length }}/{{ max }}
    </span>
    <Button v-if="defaults" size="s" plain @click="reset">
      <template #icon>
        <Icon name="ph:arrow-counter-clockwise" />
      </template>
      Reset
    </Button>
  </Flex>

  <ConfirmModal
    v-if="defaults"
    v-model:open="resetConfirmOpen"
    :confirm="applyDefaults"
    title="Reset reactions"
    description="This replaces your current reactions with the defaults. You can't undo it."
    confirm-text="Reset"
    cancel-text="Cancel"
  />
</template>

<style lang="scss" scoped>
.reaction-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  font-size: var(--font-size-l);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-raised);
  position: relative;

  // Removable, draggable emoji chips: grab cursor and a red-strike hover that
  // reads as "click to remove".
  &:not(.reaction-chip--add) {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }

    &:hover {
      background: var(--color-button-gray-hover);

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        box-shadow: inset 0 0 0 1px var(--color-text-red);
      }
    }
  }

  // The chip being dragged fades so the live reorder is easy to follow.
  &--dragging {
    opacity: 0.4;
  }

  // Add trigger: a dashed, muted plus that brightens on hover and dims when
  // the cap is reached.
  &--add {
    background: transparent;
    border: 1px dashed var(--color-border-strong);
    color: var(--color-text-lighter);

    &:hover:not(:disabled) {
      background: var(--color-button-gray-hover);
      color: var(--color-text);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.reaction-chip__count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
