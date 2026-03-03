<script setup lang="ts">
import { Button, ButtonGroup, Flex, Input, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  initialLatex?: string
  /**
   * When provided the modal is in "edit" mode and the type selector is hidden
   * because you cannot change an existing node's type.
   */
  type?: 'inline' | 'block'
  editPos?: number | null
}>()

const emit = defineEmits<{
  confirm: [payload: { latex: string, type: 'inline' | 'block', editPos: number | null }]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const latex = ref('')
const selectedType = ref<'inline' | 'block'>('inline')

// Sync inputs when the modal opens
watch(isOpen, (open) => {
  if (open) {
    latex.value = props.initialLatex ?? ''
    selectedType.value = props.type ?? 'inline'
  }
  else {
    latex.value = ''
  }
})

const isEditing = computed(() => props.editPos != null)
const resolvedType = computed(() => props.type ?? selectedType.value)

function handleConfirm() {
  const trimmed = latex.value.trim()
  if (!trimmed)
    return

  emit('confirm', {
    latex: trimmed,
    type: resolvedType.value,
    editPos: props.editPos ?? null,
  })

  isOpen.value = false
}
</script>

<template>
  <Modal
    :open="isOpen"
    centered
    :card="{ separators: true }"
    size="s"
    @close="isOpen = false"
  >
    <template #header>
      <h4>{{ isEditing ? 'Edit math' : 'Insert math' }}</h4>
    </template>

    <Flex column gap="s">
      <!-- Type selector – only shown when inserting a new node -->
      <ButtonGroup if="!isEditing">
        <Button
          size="s"
          :variant="selectedType === 'inline' ? 'accent' : 'gray'"
          @click="selectedType = 'inline'"
        >
          Inline
        </Button>
        <Button
          size="s"
          :variant="selectedType === 'block' ? 'accent' : 'gray'"
          @click="selectedType = 'block'"
        >
          Block
        </Button>
      </ButtonGroup>

      <Input
        v-model="latex"
        label="LaTeX"
        placeholder="e.g. \frac{a}{b}"
        autofocus
        expand
        @keydown.enter.prevent="handleConfirm"
      />

      <p class="math-modal-hint">
        Enter a
        <a href="https://katex.org/docs/supported.html" target="_blank" rel="noopener noreferrer">KaTeX-supported</a>
        LaTeX expression. Inline math renders within a line; block math renders as a centred display.
      </p>
    </Flex>

    <template #footer="{ close }">
      <Flex gap="s" x-end expand>
        <Button @click="close">
          Cancel
        </Button>
        <Button
          variant="accent"
          :disabled="!latex.trim()"
          @click="handleConfirm"
        >
          {{ isEditing ? 'Update' : 'Insert' }}
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.math-modal-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);

  a {
    text-decoration: underline;

    &:hover {
      text-decoration: none;
    }
  }
}
</style>
