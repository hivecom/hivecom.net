<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { TextColorName } from './plugins/textColor'
import type { TextFontName } from './plugins/textFont'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { Button, ButtonGroup, Flex, Popout, Tooltip } from '@dolanske/vui'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { createReusableTemplate } from '@vueuse/core'
import { capitalize, computed, ref } from 'vue'
import { TEXT_COLOR_NAMES, textColorValue } from './plugins/textColor'
import { TEXT_FONT_NAMES, textFontValue } from './plugins/textFont'

const props = defineProps<{
  editor: Editor
  // When true the toolbar renders as a static bar above the editor (plain text
  // mode) rather than as a floating bubble menu tied to the selection.
  plainText?: boolean
  // The underlying <textarea> element exposed by VUI's Textarea component.
  // Required in plain text mode so toolbar buttons can splice markdown syntax
  // around the current text selection.
  textareaEl?: HTMLTextAreaElement | null
}>()

// ---------------------------------------------------------------------------
// Plain text markdown insertion
// ---------------------------------------------------------------------------

// Wraps or prefixes the current textarea selection with markdown syntax and
// emits the updated value. After insertion the selection is restored so the
// user can keep typing naturally.
function insertMarkdown(
  before: string,
  after: string = '',
  linePrefix: string = '',
) {
  const el = props.textareaEl
  if (!el)
    return

  const start = el.selectionStart
  const end = el.selectionEnd
  const value = el.value
  const selected = value.slice(start, end)

  let inserted: string
  let cursorStart: number
  let cursorEnd: number

  if (linePrefix) {
    // Block-level prefix (e.g. "## "): apply to each selected line.
    // If nothing is selected, just insert the prefix and a placeholder.
    if (selected.length === 0) {
      inserted = linePrefix
      cursorStart = start + linePrefix.length
      cursorEnd = cursorStart
    }
    else {
      inserted = selected
        .split('\n')
        .map(line => linePrefix + line)
        .join('\n')
      cursorStart = start
      cursorEnd = start + inserted.length
    }
    el.value = value.slice(0, start) + inserted + value.slice(end)
  }
  else {
    // Inline wrap (e.g. **bold**).
    inserted = before + selected + after
    el.value = value.slice(0, start) + inserted + value.slice(end)
    cursorStart = start + before.length
    cursorEnd = cursorStart + selected.length
  }

  el.selectionStart = cursorStart
  el.selectionEnd = cursorEnd
  el.focus()

  // Notify the parent so content / plainTextContent stay in sync.
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// Insert a spoiler block in plain text mode, wrapping selected text if any
function insertSpoilerMarkdown() {
  const el = props.textareaEl
  if (!el)
    return

  const start = el.selectionStart
  const end = el.selectionEnd
  const value = el.value
  const selected = value.slice(start, end)
  const hasSelection = start !== end

  const spoilerBlock = `:::details
:::detailsSummary
Spoiler
:::

:::detailsContent

${hasSelection ? selected : '[content]'}

:::

:::
`

  // Insert at cursor, or replace selection
  const newValue = value.slice(0, start) + spoilerBlock + value.slice(end)
  el.value = newValue

  // Move cursor to [content] for convenience if nothing was selected
  if (!hasSelection) {
    const contentPos = newValue.indexOf('[content]')
    if (contentPos !== -1) {
      el.setSelectionRange(contentPos, contentPos + '[content]'.length)
      el.focus()
    }
  }
  else {
    // Place cursor after the inserted block
    const afterBlock = value.slice(0, start).length + spoilerBlock.length
    el.setSelectionRange(afterBlock, afterBlock)
    el.focus()
  }

  // Notify the parent so content / plainTextContent stay in sync.
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// ---------------------------------------------------------------------------
// Heading picker
// ---------------------------------------------------------------------------

const headingPickerOpen = ref(false)
const headingButtonRef = ref<HTMLElement | null>(null)

type HeadingLevel = 1 | 2 | 3 | 4

const HEADING_LABELS: Record<HeadingLevel, string> = {
  1: 'Heading 1',
  2: 'Heading 2',
  3: 'Heading 3',
  4: 'Heading 4',
}

const HEADING_LEVELS = [1, 2, 3, 4] as const

function getActiveHeading(): HeadingLevel | null {
  if (props.plainText)
    return null
  for (const level of HEADING_LEVELS) {
    if (props.editor.isActive('heading', { level }))
      return level
  }
  return null
}

function toggleHeading(level: HeadingLevel) {
  if (props.plainText) {
    insertMarkdown('', '', `${'#'.repeat(level)} `)
  }
  else {
    if (getActiveHeading() === level) {
      props.editor.chain().focus().setParagraph().run()
    }
    else {
      props.editor.chain().focus().toggleHeading({ level }).run()
    }
  }
  headingPickerOpen.value = false
}

function clearHeading() {
  if (!props.plainText)
    props.editor.chain().focus().setParagraph().run()
  headingPickerOpen.value = false
}

// ---------------------------------------------------------------------------
// Color picker
// ---------------------------------------------------------------------------

const colorPickerOpen = ref(false)
const bucketButtonRef = ref<HTMLElement | null>(null)

function getActiveColor(): TextColorName | null {
  if (props.plainText)
    return null
  const attrs = props.editor.getAttributes('textColor')
  const color = attrs?.color
  return typeof color === 'string' && color.trim() !== '' ? color as TextColorName : null
}

function toggleColor(color: TextColorName) {
  if (props.plainText) {
    insertMarkdown(`:::color[${color}]`, ':::')
  }
  else {
    if (getActiveColor() === color) {
      props.editor.chain().focus().unsetTextColor().run()
    }
    else {
      props.editor.chain().focus().setTextColor(color).run()
    }
  }
  colorPickerOpen.value = false
}

function clearColor() {
  if (!props.plainText)
    props.editor.chain().focus().unsetTextColor().run()
  colorPickerOpen.value = false
}

// Returns a human-readable label for a palette color name.
// --text-color-white aliases --color-text-invert and --text-color-black aliases
// --color-text. In dark mode those tokens resolve inversely to their names
// (text-invert = near-black, text = near-white), so we swap the labels.
// Friendly display labels for the semantic palette entries.
const SWATCH_LABELS: Partial<Record<TextColorName, string>> = {
  'text-invert': 'text invert',
  'text-lighter': 'text lighter',
  'text-lightest': 'text lightest',
  'text': 'text',
}

function swatchLabel(name: TextColorName): string {
  return SWATCH_LABELS[name] ?? name
}

// Tints the paint bucket icon with the active color, visible at a glance
const bucketStyle = computed(() => {
  const color = getActiveColor()
  return color ? { color: textColorValue(color) } : {}
})

// ---------------------------------------------------------------------------
// Font picker
// ---------------------------------------------------------------------------

const fontPickerOpen = ref(false)
const fontButtonRef = ref<HTMLElement | null>(null)

const FONT_LABELS: Record<TextFontName, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Monospace',
  cursive: 'Cursive',
  fantasy: 'Fantasy',
}

function getActiveFont(): TextFontName | null {
  if (props.plainText)
    return null
  const attrs = props.editor.getAttributes('textFont')
  const font = attrs?.font
  return typeof font === 'string' && font.trim() !== '' ? font as TextFontName : null
}

function toggleFont(font: TextFontName) {
  if (props.plainText) {
    insertMarkdown(`:::font[${font}]`, ':::')
  }
  else {
    if (getActiveFont() === font) {
      props.editor.chain().focus().unsetTextFont().run()
    }
    else {
      props.editor.chain().focus().setTextFont(font).run()
    }
  }
  fontPickerOpen.value = false
}

function clearFont() {
  if (!props.plainText)
    props.editor.chain().focus().unsetTextFont().run()
  fontPickerOpen.value = false
}

// ---------------------------------------------------------------------------
// Size picker
// ---------------------------------------------------------------------------

function toggleTinyText() {
  const tinySize = 's'

  if (props.plainText) {
    insertMarkdown(`:::size[${tinySize}]`, ':::')
  }
  else {
    if (props.editor.getAttributes('textSize').size === tinySize) {
      props.editor.chain().focus().unsetTextSize().run()
    }
    else {
      props.editor.chain().focus().setTextSize(tinySize).run()
    }
  }
}

// ---------------------------------------------------------------------------
// Bubble menu visibility
// ---------------------------------------------------------------------------

// Makes sure that when editor is clicked, we do not show bubble menu for empty
// text selection. Not used in plain text mode.
function shouldShow({ state, from, to }: ShouldShowMenuProps): boolean {
  const { selection } = state
  const { empty } = selection

  if (empty)
    return false

  return state.doc.textBetween(from, to).length > 0
}

// ---------------------------------------------------------------------------
// Reusable toolbar template
// ---------------------------------------------------------------------------

// The button groups are identical between the static (plain text) toolbar and
// the floating bubble menu. We define them once here and render the same
// template in both places instead of duplicating ~220 lines of markup.
const [DefineToolbar, ReuseToolbar] = createReusableTemplate()

const bodyEl = document.body
</script>

<template>
  <!-- Shared toolbar button groups - defined once, used in both modes below -->
  <DefineToolbar>
    <Flex :gap="4">
      <ButtonGroup>
        <!-- Heading -->
        <Button
          ref="headingButtonRef"
          size="s"
          square
          :class="{ 'is-active': headingPickerOpen || getActiveHeading() !== null }"
          @click="headingPickerOpen = !headingPickerOpen"
        >
          <Icon :size="18" name="ph:text-h-one" />
        </Button>

        <Popout
          :anchor="headingButtonRef"
          :visible="headingPickerOpen"
          placement="bottom"
          :offset="6"
          @click-outside="headingPickerOpen = false"
        >
          <div class="list-popout">
            <button
              v-for="level in HEADING_LEVELS"
              :key="level"
              class="list-item heading-item"
              :class="{ 'is-active': getActiveHeading() === level }"
              :style="{ fontSize: `${1.4 - (level - 1) * 0.15}rem`,
                        fontWeight: 'bold' }"
              @click="toggleHeading(level)"
            >
              {{ HEADING_LABELS[level] }}
            </button>

            <div v-if="getActiveHeading()" class="list-clear-row">
              <button class="list-clear" @click="clearHeading">
                <Icon :size="10" name="ph:x" />
                Paragraph
              </button>
            </div>
          </div>
        </Popout>

        <!-- Inline formatting -->
        <template v-if="plainText">
          <Button size="s" square @click="insertMarkdown('**', '**')">
            <Icon :size="18" name="ph:text-b" />
          </Button>
          <Button size="s" square @click="insertMarkdown('*', '*')">
            <Icon :size="18" name="ph:text-italic" />
          </Button>
          <Button size="s" square @click="insertMarkdown('<u>', '</u>')">
            <Icon :size="18" name="ph:text-underline" />
          </Button>
          <Button size="s" square @click="insertMarkdown('~~', '~~')">
            <Icon :size="18" name="ph:text-strikethrough" />
          </Button>
          <Button size="s" square @click="insertMarkdown('`', '`')">
            <Icon :size="18" name="ph:code" />
          </Button>
        </template>
        <template v-else>
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
        </template>

        <!-- Color -->
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
              <Tooltip
                v-for="name in TEXT_COLOR_NAMES"
                :key="name"
                placement="top"
              >
                <template #tooltip>
                  <p>{{ capitalize(swatchLabel(name)) }}</p>
                </template>
                <button
                  class="color-swatch"
                  :class="{ 'is-active': getActiveColor() === name }"
                  :style="{ backgroundColor: textColorValue(name) }"
                  @click="toggleColor(name)"
                />
              </Tooltip>
            </div>
            <div v-if="getActiveColor()" class="color-clear-row">
              <button class="color-swatch color-swatch--clear" @click="clearColor">
                <Icon :size="10" name="ph:x" />
              </button>
            </div>
          </div>
        </Popout>

        <!-- Font family -->
        <Button
          ref="fontButtonRef"
          size="s"
          square
          :class="{ 'is-active': fontPickerOpen || getActiveFont() !== null }"
          @click="fontPickerOpen = !fontPickerOpen"
        >
          <Icon :size="18" name="ph:text-aa" />
        </Button>

        <Popout
          :anchor="fontButtonRef"
          :visible="fontPickerOpen"
          placement="bottom"
          :offset="6"
          @click-outside="fontPickerOpen = false"
        >
          <div class="list-popout">
            <button
              v-for="name in TEXT_FONT_NAMES"
              :key="name"
              class="list-item"
              :class="{ 'is-active': getActiveFont() === name }"
              :style="{ fontFamily: textFontValue(name) }"
              @click="toggleFont(name)"
            >
              {{ FONT_LABELS[name] }}
            </button>
            <div v-if="getActiveFont()" class="list-clear-row">
              <button class="list-clear" @click="clearFont">
                <Icon :size="10" name="ph:x" />
                Reset font
              </button>
            </div>
          </div>
        </Popout>

        <!-- Font size -->
        <Button
          size="s"
          square
          @click="toggleTinyText()"
        >
          <Icon :size="18" name="material-symbols-light:lowercase" />
        </Button>
      </ButtonGroup>

      <!-- Block formatting -->
      <template v-if="plainText">
        <ButtonGroup>
          <Button size="s" square @click="insertMarkdown('', '', '- ')">
            <Icon :size="18" name="ph:list-bullets" />
          </Button>
          <Button size="s" square @click="insertMarkdown('', '', '1. ')">
            <Icon :size="18" name="ph:list-numbers" />
          </Button>
          <Button size="s" square @click="insertMarkdown('', '', '- [ ] ')">
            <Icon :size="18" name="ph:check-square" />
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Button size="s" square @click="insertMarkdown('```\n', '\n```')">
            <Icon :size="18" name="ph:code-block" />
          </Button>
          <Button size="s" square @click="insertMarkdown('', '', '> ')">
            <Icon :size="18" name="ph:quotes" />
          </Button>
        </ButtonGroup>
      </template>
      <template v-else>
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
      </template>
      <ButtonGroup v-if="!plainText">
        <Button size="s" square @click="props.editor.chain().focus().setDetails().insertContent('Spoiler').run()">
          <Icon :size="18" name="ph:eye-slash" />
        </Button>
      </ButtonGroup>
      <ButtonGroup v-else>
        <Button size="s" square @click="insertSpoilerMarkdown">
          <Icon :size="18" name="ph:eye-slash" />
        </Button>
      </ButtonGroup>
    </Flex>
  </DefineToolbar>

  <!-- Static toolbar: rendered above the textarea in plain text mode -->
  <template v-if="plainText">
    <div class="rich-text-menu rich-text-menu--static">
      <ReuseToolbar />
    </div>
  </template>

  <!-- Rich text mode: floating bubble menu that appears on selection -->
  <BubbleMenu
    v-else
    :editor="editor"
    :options="{
      placement: 'top',
      offset: 8,
    }"
    :should-show="shouldShow"
    :append-to="bodyEl"
  >
    <div class="rich-text-menu">
      <ReuseToolbar />
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

  // Static variant sits flush above the textarea inside the editor container
  &--static {
    margin-top: -8px;
    padding-inline: 0;
    // Use custom value since the jump between xxs and xs is too much
    // and I want to shave as much as possible while visually keeping things clean
    padding-bottom: 6px;
  }
}

// ---------------------------------------------------------------------------
// Color picker popout
// ---------------------------------------------------------------------------

.color-popout {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
}

.color-clear-row {
  display: flex;
  justify-content: center;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(4, 18px);
  gap: 4px;
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
    background-color: var(--color-button-gray) !important;
    color: var(--color-text-lighter);
    width: 100%;
    height: 16px;
    border-radius: var(--border-radius-s);

    &:hover {
      color: var(--color-text);
      background-color: var(--color-button-gray-hover) !important;
      transform: none;
    }
  }
}

// ---------------------------------------------------------------------------
// Font, size & heading picker popouts (shared list style)
// ---------------------------------------------------------------------------

.list-popout {
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 140px;
  gap: 2px;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: var(--border-radius-s);
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background-color var(--transition-fast);
  line-height: 1.4;

  &:hover {
    background-color: var(--color-button-gray-hover);
  }

  &.is-active {
    background-color: var(--color-button-gray);
    color: var(--color-text);
  }
}

.list-clear-row {
  border-top: 1px solid var(--color-border-weak);
  margin-top: 2px;
  padding-top: 2px;
}

.list-clear {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 4px 8px;
  border-radius: var(--border-radius-s);
  border: none;
  background: transparent;
  color: var(--color-text-lighter);
  cursor: pointer;
  font-size: var(--font-size-xs);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);

  &:hover {
    background-color: var(--color-button-gray-hover);
    color: var(--color-text);
  }
}
</style>
