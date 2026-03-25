<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { Button, ButtonGroup, Flex } from '@dolanske/vui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  editor: Editor
}>()

// ---------------------------------------------------------------------------
// Detect whether the cursor is currently inside a table
// ---------------------------------------------------------------------------

function getTableDomNode(): HTMLElement | null {
  const { state, view } = props.editor
  if (!view.dom.isConnected)
    return null

  try {
    const { $from } = state.selection
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        const pos = $from.before(d)
        return view.nodeDOM(pos) as HTMLElement | null
      }
    }
  }
  catch {
    // Selection may be invalid during teardown
  }
  return null
}

// ---------------------------------------------------------------------------
// Reactive position - updated on every editor transaction
// ---------------------------------------------------------------------------

interface MenuPos {
  top: number
  left: number
  width: number
}

const menuPos = ref<MenuPos | null>(null)
const menuEl = ref<HTMLElement | null>(null)

function updatePosition() {
  const tableDom = getTableDomNode()
  if (!tableDom) {
    menuPos.value = null
    return
  }

  const rect = tableDom.getBoundingClientRect()
  const editorRect = props.editor.view.dom.getBoundingClientRect()
  // Span the full editor width, positioned above the table
  menuPos.value = {
    top: rect.top - 42, // 42 ≈ menu height + gap
    left: editorRect.left,
    width: editorRect.width,
  }
}

// Subscribe to editor transactions so we react to cursor moves
function onTransaction() {
  updatePosition()
}

onMounted(() => {
  props.editor.on('transaction', onTransaction)
  // Also update on scroll/resize so the position tracks the editor
  window.addEventListener('scroll', updatePosition, { passive: true, capture: true })
  window.addEventListener('resize', updatePosition, { passive: true })
})

onBeforeUnmount(() => {
  props.editor.off('transaction', onTransaction)
  window.removeEventListener('scroll', updatePosition, { capture: true } as EventListenerOptions)
  window.removeEventListener('resize', updatePosition)
})

const isVisible = computed(() => menuPos.value !== null)

// ---------------------------------------------------------------------------
// Table commands
// ---------------------------------------------------------------------------

function run(fn: () => void) {
  fn()
  props.editor.commands.focus()
}

function addColumnBefore() {
  run(() => props.editor.chain().addColumnBefore().run())
}

function addColumnAfter() {
  run(() => props.editor.chain().addColumnAfter().run())
}

function deleteColumn() {
  run(() => props.editor.chain().deleteColumn().run())
}

function addRowBefore() {
  run(() => props.editor.chain().addRowBefore().run())
}

function addRowAfter() {
  run(() => props.editor.chain().addRowAfter().run())
}

function deleteRow() {
  run(() => props.editor.chain().deleteRow().run())
}

function deleteTable() {
  run(() => props.editor.chain().deleteTable().run())
}

function toggleHeaderRow() {
  run(() => props.editor.chain().toggleHeaderRow().run())
}
</script>

<template>
  <Teleport to="body">
    <Transition name="table-menu">
      <div
        v-if="isVisible && menuPos"
        ref="menuEl"
        class="editor-table-menu"
        :style="{
          top: `${menuPos.top}px`,
          left: `${menuPos.left}px`,
          width: `${menuPos.width}px`,
        }"
      >
        <Flex gap="xxs" y-center x-between>
          <Flex gap="xxs" y-center>
            <!-- Column controls -->
            <ButtonGroup>
              <Button size="s" square plain @click="addColumnBefore">
                <Icon :size="16" name="ph:arrow-line-left" />
              </Button>
              <Button size="s" square plain @click="deleteColumn">
                <Icon :size="16" name="ph:columns" />
              </Button>
              <Button size="s" square plain @click="addColumnAfter">
                <Icon :size="16" name="ph:arrow-line-right" />
              </Button>
            </ButtonGroup>

            <div class="table-menu-divider" />

            <!-- Row controls -->
            <ButtonGroup>
              <Button size="s" square plain @click="addRowBefore">
                <Icon :size="16" name="ph:arrow-line-up" />
              </Button>
              <Button size="s" square plain @click="deleteRow">
                <Icon :size="16" name="ph:rows" />
              </Button>
              <Button size="s" square plain @click="addRowAfter">
                <Icon :size="16" name="ph:arrow-line-down" />
              </Button>
            </ButtonGroup>
          </Flex>

          <Flex gap="xxs" y-center>
            <!-- Header row toggle -->
            <Button size="s" square plain @click="toggleHeaderRow">
              <Icon :size="16" name="ph:text-h" />
            </Button>

            <div class="table-menu-divider" />

            <!-- Delete table -->
            <Button size="s" square variant="danger" plain @click="deleteTable">
              <Icon :size="16" name="ph:trash" />
            </Button>
          </Flex>
        </Flex>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.editor-table-menu {
  position: fixed;
  z-index: var(--z-toast);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  box-shadow: var(--box-shadow-strong);
  padding: var(--space-xxs) var(--space-xs);
  pointer-events: all;
}

.table-menu-divider {
  width: 1px;
  height: 20px;
  background-color: var(--color-border);
  flex-shrink: 0;
}

.table-menu-enter-active,
.table-menu-leave-active {
  transition: opacity var(--transition-fast);
}

.table-menu-enter-from,
.table-menu-leave-to {
  opacity: 0;
}
</style>
