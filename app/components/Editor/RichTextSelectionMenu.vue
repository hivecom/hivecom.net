<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { Button, ButtonGroup, Flex, Popout } from '@dolanske/vui'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, ref } from 'vue'

const props = defineProps<{
  editor: Editor
}>()

const colorPickerOpen = ref(false)
const bucketButtonRef = ref<HTMLElement | null>(null)
const nativePickerRef = ref<HTMLInputElement | null>(null)

// The value bound to the native <input type="color">.
// Initialised to the active color so the picker opens at the right hue.
const nativePickerValue = ref('#ffffff')

// A fixed palette of visually distinct hex colors
const COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f8fafc', // white
  '#64748b', // slate
]

// Makes sure that when editor is clicked, we do not show bubble menu for empty text selection
function shouldShow({ state, from, to }: ShouldShowMenuProps): boolean {
  const { selection } = state
  const { empty } = selection

  if (empty) {
    return false
  }

  return state.doc.textBetween(from, to).length > 0
}

function getActiveColor(): string | null {
  const attrs = props.editor.getAttributes('textColor')
  const color = attrs?.color
  return typeof color === 'string' && color.trim() !== '' ? color : null
}

function toggleColor(color: string) {
  if (getActiveColor() === color) {
    props.editor.chain().focus().unsetTextColor().run()
  }
  else {
    props.editor.chain().focus().setTextColor(color).run()
  }
  colorPickerOpen.value = false
}

function clearColor() {
  props.editor.chain().focus().unsetTextColor().run()
  colorPickerOpen.value = false
}

function openNativePicker() {
  nativePickerValue.value = getActiveColor() ?? '#ffffff'
  nativePickerRef.value?.click()
}

function onNativePickerInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  props.editor.chain().focus().setTextColor(value).run()
}

function onNativePickerChange() {
  colorPickerOpen.value = false
}

// Tints the paint bucket icon with the active color so it's visible at a glance
const bucketStyle = computed(() => {
  const color = getActiveColor()
  return color ? { color } : {}
})
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :options="{
      placement: 'top',
      offset: 8,
    }"
    :should-show="shouldShow"
  >
    <div class="rich-text-menu">
      <!-- Main toolbar row -->
      <Flex :gap="4">
        <ButtonGroup>
          <Button size="s" square @click="props.editor.chain().focus().toggleBold().run()">
            <Icon :size="18" name="ph:text-b" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleItalic().run()">
            <Icon :size="18" name="ph:text-italic" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleUnderline().run()">
            <Icon :size="18" name="ph:text-underline" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleStrike().run()">
            <Icon :size="18" name="ph:text-strikethrough" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleCode().run()">
            <Icon :size="18" name="ph:code" />
          </Button>

          <!-- Paint bucket — anchor for the color Popout -->
          <Button
            ref="bucketButtonRef"
            size="s"
            square
            :class="{ 'is-active': colorPickerOpen }"
            @click="colorPickerOpen = !colorPickerOpen"
          >
            <Icon :size="18" name="ph:paint-bucket" :style="bucketStyle" />
          </Button>

          <Popout
            :anchor="bucketButtonRef"
            :visible="colorPickerOpen"
            placement="bottom"
            :offset="6"
            @click-outside="colorPickerOpen = false"
          >
            <div class="color-popout">
              <div class="color-grid">
                <button
                  v-for="color in COLOR_PALETTE"
                  :key="color"
                  class="color-swatch"
                  :class="{ 'is-active': getActiveColor() === color }"
                  :style="{ backgroundColor: color }"
                  :data-title-bottom="color"
                  @click="toggleColor(color)"
                />
              </div>

              <div class="color-actions">
                <button
                  class="color-swatch color-swatch--custom"
                  data-title-bottom="Custom color"
                  @click="openNativePicker"
                >
                  <Icon :size="12" name="ph:eyedropper" />
                </button>
                <input
                  ref="nativePickerRef"
                  v-model="nativePickerValue"
                  type="color"
                  class="native-color-input"
                  tabindex="-1"
                  @input="onNativePickerInput"
                  @change="onNativePickerChange"
                >

                <button
                  v-if="getActiveColor()"
                  class="color-swatch color-swatch--clear"
                  data-title-bottom="Remove color"
                  @click="clearColor"
                >
                  <Icon :size="10" name="ph:x" />
                </button>
              </div>
            </div>
          </Popout>
        </ButtonGroup>

        <ButtonGroup>
          <Button size="s" square @click="props.editor.chain().focus().toggleBulletList().run()">
            <Icon :size="18" name="ph:list-bullets" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleOrderedList().run()">
            <Icon :size="18" name="ph:list-numbers" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleTaskList().run()">
            <Icon :size="18" name="ph:check-square" />
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Button size="s" square @click="props.editor.chain().focus().toggleCodeBlock().run()">
            <Icon :size="18" name="ph:code-block" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleBlockquote().run()">
            <Icon :size="18" name="ph:quotes" />
          </Button>
        </ButtonGroup>
      </Flex>
    </div>
  </BubbleMenu>
</template>

<style scoped lang="scss">
:root.light .rich-text-menu :deep(.vui-button-group) {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
}

.rich-text-menu :deep(.vui-button.is-active) {
  background-color: var(--color-bg-raised);
}

.rich-text-menu {
  padding: 2px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.color-popout {
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  padding: 4px;
}

.color-grid {
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
}

.color-actions {
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  padding-left: 4px;
  border-left: 1px solid var(--color-border-weak);
}

.color-swatch {
  width: 18px;
  height: 18px;
  border-radius: var(--border-radius-s);
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color var(--transition-fast),
    transform var(--transition-fast);

  &:hover {
    transform: scale(1.15);
  }

  &.is-active {
    border-color: var(--color-text);
  }

  &--clear {
    background-color: var(--color-bg-medium) !important;
    color: var(--color-text-light);
  }

  &--custom {
    background-color: var(--color-bg-medium);
    color: var(--color-text-light);
  }
}

.native-color-input {
  position: absolute;
  width: 0;
  height: 0;
  padding: 0;
  border: none;
  opacity: 0;
  pointer-events: none;
}
</style>
