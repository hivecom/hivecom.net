<script setup lang="ts">
import { ref } from 'vue'

// A drag-and-drop file target that wraps arbitrary content. Lifted from the
// chat composer's dropzone so other surfaces (the sharing page) get the same
// behavior: an overlay appears while files are dragged over, and a drop emits
// the file list. The slot content stays interactive until a drag starts.
const props = withDefaults(defineProps<{
  // Ignore drags entirely (e.g. while an upload is already in flight).
  disabled?: boolean
  label?: string
}>(), {
  disabled: false,
  label: 'Drop files to upload',
})

const emit = defineEmits<{
  drop: [files: FileList]
}>()

const dragging = ref(false)

function onDragOver(event: DragEvent) {
  if (props.disabled || !event.dataTransfer?.types.includes('Files'))
    return
  event.preventDefault()
  dragging.value = true
}

function onDragLeave(event: DragEvent) {
  // Moving between child nodes inside the zone still fires dragleave; ignore it
  // so the overlay doesn't flicker.
  if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && (event.currentTarget as Node).contains(event.relatedTarget))
    return
  dragging.value = false
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (props.disabled || !files?.length)
    return
  event.preventDefault()
  emit('drop', files)
}
</script>

<template>
  <div class="file-dropzone" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div v-if="dragging" class="file-dropzone__overlay">
      <Icon name="ph:upload-simple" size="24" />
      <span>{{ label }}</span>
    </div>
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.file-dropzone {
  position: relative;

  &__overlay {
    position: absolute;
    inset: 0;
    z-index: var(--z-popout);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    border-radius: var(--border-radius-m);
    border: 2px dashed var(--color-accent);
    background: color-mix(in srgb, var(--color-bg) 92%, transparent);
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    pointer-events: none;
  }
}
</style>
