<script setup lang="ts">
import { Spinner, theme } from '@dolanske/vui'
import { getCssVarAsHex, SCALE_CONFIGS, VUI_COLOR_KEYS } from '@/lib/theme'

/**
 * NOTE (@dolanske):
 *
 * At the moment, code editor only supports CSS and is configured to provide
 * completions for VUI tokens. If at some point we need more generic
 * functionality, we should split the CSS definitiosn into a lib file and keep
 * it out of this component.
 */

// Types are derived lazily to avoid a static ESM import of monaco-editor
// which would pull its chunks (containing import.meta) into the initial bundle.
type MonacoModule = typeof import('monaco-editor')
type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor
type MonacoIDisposable = import('monaco-editor').IDisposable

const props = defineProps<{
  focused: boolean
}>()

const COMMENT_RE = /\/\*[\s\S]*?\*\//g

const model = defineModel<string>()

// const activeThemeVariant = computed(() => theme.value === 'light' ? 'light' : 'dark')
const containerRef = useTemplateRef('containerRef')
const loaded = ref(false)

let editorInstance: MonacoEditor | null = null
let monacoInstance: MonacoModule | null = null
let completionDisposable: MonacoIDisposable | null = null

function updateCommentMarkers(monaco: MonacoModule, editor: MonacoEditor) {
  const model = editor.getModel()
  if (!model)
    return

  const text = model.getValue()
  const markers: import('monaco-editor').editor.IMarkerData[] = []

  let match: RegExpExecArray | null
  COMMENT_RE.lastIndex = 0
  // eslint-disable-next-line no-cond-assign
  while ((match = COMMENT_RE.exec(text)) !== null) {
    const start = model.getPositionAt(match.index)
    const end = model.getPositionAt(match.index + match[0].length)
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: 'Block comments (/* ... */) are stripped on save. This is a security measure - comments can be used to obfuscate dangerous patterns (e.g. java/**/script:) that would otherwise bypass sanitization. To document your CSS, consider posting a comment under your theme - you can pin it to keep notes visible at the top.',
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    })
  }

  monaco.editor.setModelMarkers(model, 'hivecom-css', markers)
}

// Add tokens to this list if you want the editor to hint/autocomplete them
const VUI_TOKENS: { name: string, description: string }[] = [
  ...VUI_COLOR_KEYS.map(key => ({ name: `--color-${key}`, description: 'VUI color token' })),
  ...['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 'xxxxl'].map(s => ({ name: `--font-size-${s}`, description: 'VUI font size token' })),
  ...SCALE_CONFIGS.spacing.tokens.map(t => ({ name: t.varName, description: `VUI spacing: ${t.defaultValue}px` })),
  ...SCALE_CONFIGS.rounding.tokens.map(t => ({ name: t.varName, description: `VUI border radius: ${t.defaultValue}px` })),
  ...SCALE_CONFIGS.transitions.tokens.map(t => ({ name: t.varName, description: `VUI transition: ${t.defaultValue}s` })),
  { name: '--interactive-el-height', description: 'VUI interactive element height: 34px. Changing this will modify the height of inputs, buttons and more' },
  ...['behind', 'default', 'active', 'mask', 'sticky', 'nav', 'overlay', 'popout', 'toast', 'modal'].map(s => ({ name: `--z-${s}`, description: 'VUI z-index token' })),
]

const CUSTOM_PROP_RE = /(--[\w-]*)$/

function registerVuiCompletions(monaco: MonacoModule) {
  return monaco.languages.registerCompletionItemProvider('css', {
    triggerCharacters: ['-'],
    provideCompletionItems(model, position) {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const match = CUSTOM_PROP_RE.exec(textUntilPosition)

      if (!match?.[1])
        return { suggestions: [] }

      const startColumn = position.column - match[1].length
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: position.column,
      }

      return {
        suggestions: VUI_TOKENS.map(token => ({
          label: token.name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: token.name,
          detail: token.description,
          range,
        })),
      }
    },
  })
}

function $(name: string) {
  return getCssVarAsHex(`--color-${name}`)
}

function applyHivecomTheme(monaco: MonacoModule) {
  monaco.editor.defineTheme('hivecom', {
    base: theme.value === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: $('text-lighter').slice(1), fontStyle: 'italic' },
      { token: 'string', foreground: $('text-green').slice(1) },
      { token: 'number', foreground: $('text-blue').slice(1) },
      { token: 'keyword', foreground: $('accent').slice(1) },
      { token: 'attribute.name', foreground: $('text-blue').slice(1) },
      { token: 'attribute.value', foreground: $('text-green').slice(1) },
    ],
    colors: {
      'editor.background': $('bg'),
      'editor.foreground': $('text'),
      'editor.lineHighlightBackground': $('bg-raised'),
      // Add slight transparency to selections
      'editor.selectionBackground': `${$('bg-accent-raised')}33`,
      'editor.inactiveSelectionBackground': `${$('bg-accent-lowered')}33`,
      'editorSuggestWidget.selectedBackground': `${$('bg-raised')}33`,
      'editorCursor.foreground': $('accent'),
      'editorLineNumber.foreground': $('text-lighter'),
      'editorLineNumber.activeForeground': $('text-light'),
      'editorIndentGuide.background1': $('border-weak'),
      'editorIndentGuide.activeBackground1': $('border'),
      'editorWidget.background': $('bg-medium'),
      'editorWidget.border': $('border'),
      'editorSuggestWidget.background': $('bg-medium'),
      'editorSuggestWidget.border': $('border'),
      'input.background': $('bg-lowered'),
      'input.foreground': $('text'),
      'input.border': $('border'),
      'scrollbarSlider.background': `${$('border')}66`,
      'scrollbarSlider.hoverBackground': `${$('border-strong')}88`,
    },
  })
  monaco.editor.setTheme('hivecom')
}

onMounted(async () => {
  await nextTick()

  // MonacoEnvironment (worker setup) is configured in app/plugins/monaco.client.ts
  const monaco = await import('monaco-editor')
  monacoInstance = monaco
  completionDisposable = registerVuiCompletions(monaco)

  applyHivecomTheme(monaco)

  const editor = monaco.editor.create(containerRef.value!, {
    value: model.value,
    language: 'css',
    theme: 'hivecom',
    minimap: { enabled: false },
    padding: { top: 8, bottom: 8 },
    tabSize: 2,
    folding: false,
    lineNumbersMinChars: 2,
    fixedOverflowWidgets: true,
    fontSize: 12,
  })

  editor.onDidChangeModelContent(() => {
    model.value = editor.getValue()
    updateCommentMarkers(monaco, editor)
  })

  // Sync external model changes (e.g. reset) back into the editor.
  // Guard against re-entrancy: if the editor itself triggered the change,
  // getValue() already matches so setValue() is a no-op, but we skip it
  // anyway to avoid cursor/selection disruption.
  watch(model, (newVal) => {
    if (editorInstance && newVal !== editorInstance.getValue()) {
      editorInstance.setValue(newVal ?? '')
    }
  })

  updateCommentMarkers(monaco, editor)

  editorInstance = editor
  loaded.value = true
})

onUnmounted(() => {
  editorInstance?.dispose()
  editorInstance = null
  completionDisposable?.dispose()
  completionDisposable = null
})

watch(theme, () => {
  if (monacoInstance)
    applyHivecomTheme(monacoInstance)
})

// Relayout the editor when it receives focus. This is to fix editor shrinking
// to 5x5px window
watch(() => props.focused, async (focused) => {
  if (focused && editorInstance) {
    await nextTick()
    editorInstance.layout()
  }
})
</script>

<template>
  <Spinner v-if="!loaded" size="s" class="code-editor-spinner" />
  <div ref="containerRef" class="code-editor" style="height: 100%;width:100%" />
</template>

<style lang="scss">
.code-editor-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}
</style>
