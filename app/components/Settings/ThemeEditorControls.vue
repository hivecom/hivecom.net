<script setup lang="ts">
import type { ThemeScaleKey } from '@/lib/theme'
import type { Tables } from '@/types/database.overrides'
import { maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, ButtonGroup, Card, Checkbox, Divider, Drawer, Flex, Input, Modal, pushToast, setColorTheme, Switch, Tab, Tabs, Textarea, theme, Tooltip } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { applyScale, applyTheme, COLOR_GROUPS, dbToPercent, getCssVarAsHex, SCALE_CONFIGS, THEME_SCALE_KEYS, VUI_COLOR_KEYS } from '@/lib/theme'
import { normalizeErrors } from '@/lib/utils/formatting'
import UserName from '../Shared/UserName.vue'
import CodeEditorClient from './CodeEditor.vue'

interface Props {
  editing?: Tables<'themes'> | null
  floating?: boolean
}

const {
  editing,
  // TODO: for edit-as-you go controls
  // floating,
} = defineProps<Props>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const HYPHEN_RE = /-/g

type ThemeType = 'dark' | 'light'

const { refresh } = useDataThemes()
const { settings } = useDataUserSettings()
const { activeTheme, reapplyCustomCss, applyCustomCss } = useUserTheme()

const activeType = computed<ThemeType>(() => theme.value === 'light' ? 'light' : 'dark')

// Tabs
const activeTab = ref<'tokens' | 'css'>('tokens')

// Forking / editing
const userId = useUserId()

const themeForm = reactive<Record<ThemeType, Record<string, string>>>({
  light: {},
  dark: {},
})

const form = reactive({
  name: '',
  description: '',
  useAsCurrent: true,
  forked_from: null as string | null,
  custom_css: '',
})

const { validate, errors } = useValidation(form, {
  name: [required, minLenNoSpace(3), maxLength(64)],
  description: [maxLength(128)],
}, {
  autoclear: true,
})

const scaleValues = reactive<Record<ThemeScaleKey, number>>({
  spacing: SCALE_CONFIGS.spacing.defaultDb,
  rounding: SCALE_CONFIGS.rounding.defaultDb,
  transitions: SCALE_CONFIGS.transitions.defaultDb,
  widening: SCALE_CONFIGS.widening.defaultDb,
})

// Seed the theme from computed CSS vars into a target record
function seedPalette(prefix: 'dark' | 'light', target: Record<string, string>) {
  for (const key of VUI_COLOR_KEYS) {
    const cssVar = `--${prefix}-color-${key}`
    target[key] = getCssVarAsHex(cssVar)
  }
}

// Apply a palette record to the DOM
function applyPaletteLocal(prefix: 'dark' | 'light', source: Record<string, string>) {
  for (const key of VUI_COLOR_KEYS) {
    if (source[key] != null)
      document.documentElement.style.setProperty(`--${prefix}-color-${key}`, source[key])
  }
}

// When the user toggles dark/light, re-seed the newly active palette from
// computed styles (so we pick up VUI defaults for keys we haven't touched),
// then re-apply any overrides we had stored for that palette.
watch(activeType, (prefix) => {
  nextTick(() => {
    const target = themeForm[prefix]
    seedPalette(prefix, target)
    applyPaletteLocal(prefix, target)
  })
})

// Immediately update CSS on the document to reflect the color change
function onColorChange(key: string, value: string) {
  themeForm[activeType.value][key] = value
  const cssVar = `--${activeType.value}-color-${key}`
  document.documentElement.style.setProperty(cssVar, value)
}

// Formatted display percentage for a given scale key
function scaleDisplay(key: ThemeScaleKey): string {
  return `${Math.round(dbToPercent(scaleValues[key], key))}%`
}

// Compute --range-progress style for a range input
function rangeProgressStyle(key: ThemeScaleKey): Record<string, string> {
  return { '--range-progress': `${scaleValues[key]}%` }
}

// Called when a range slider changes
function onScaleChange(key: ThemeScaleKey, value: number) {
  const intValue = Math.round(value)
  scaleValues[key] = intValue
  applyScale(key, intValue)
}

const showCustomCSSWarning = ref(false)

onMounted(() => {
  seed()

  if (settings.value && !settings.value.allow_custom_css) {
    showCustomCSSWarning.value = true
  }
})

// Seed all editor state (colors + scales + custom CSS) from the editing prop or active theme
function seed() {
  const t = editing ?? activeTheme.value

  if (t) {
    for (const key of VUI_COLOR_KEYS) {
      const darkCol = `dark_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
      const lightCol = `light_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
      if (t[darkCol] != null)
        themeForm.dark[key] = t[darkCol] as string
      if (t[lightCol] != null)
        themeForm.light[key] = t[lightCol] as string
    }
    applyPaletteLocal('dark', themeForm.dark)
    applyPaletteLocal('light', themeForm.light)
  }
  else {
    seedPalette('dark', themeForm.dark)
    seedPalette('light', themeForm.light)
  }

  for (const key of THEME_SCALE_KEYS) {
    scaleValues[key] = t?.[key] ?? SCALE_CONFIGS[key].defaultDb
  }

  // Seed and immediately apply custom CSS from the seeded theme
  form.custom_css = t?.custom_css ?? ''
  applyCustomCss(form.custom_css)
}

// Apply custom CSS as the user types.
watch(() => form.custom_css, (css) => {
  applyCustomCss(css)
})

function reset() {
  if (editing) {
    // Restore to the saved state of the theme being edited
    for (const key of VUI_COLOR_KEYS) {
      const darkCol = `dark_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
      const lightCol = `light_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
      if (editing[darkCol] != null)
        themeForm.dark[key] = editing[darkCol] as string
      if (editing[lightCol] != null)
        themeForm.light[key] = editing[lightCol] as string
    }
    applyPaletteLocal('dark', themeForm.dark)
    applyPaletteLocal('light', themeForm.light)

    for (const key of THEME_SCALE_KEYS) {
      scaleValues[key] = editing[key] ?? SCALE_CONFIGS[key].defaultDb
      applyScale(key, scaleValues[key])
    }
  }
  else {
    applyTheme(null)

    for (const key of THEME_SCALE_KEYS) {
      scaleValues[key] = SCALE_CONFIGS[key].defaultDb
      applyScale(key, scaleValues[key])
    }

    seedPalette('dark', themeForm.dark)
    seedPalette('light', themeForm.light)
    applyPaletteLocal('dark', themeForm.dark)
    applyPaletteLocal('light', themeForm.light)
  }

  // Reset custom CSS to the editing theme's saved state (or clear for new themes)
  form.custom_css = editing?.custom_css ?? ''

  Object.assign(form, {
    name: '',
    description: '',
    useAsCurrent: true,
    forked_from: null,
  })
}

function close() {
  applyTheme(activeTheme.value ?? null)
  // Restore the active theme's custom CSS (respects allow_custom_css setting)
  reapplyCustomCss()
  emit('close')
}

// DB operations
const supabase = useSupabaseClient()

const showSubmitModal = ref(false)
const submitLoading = ref(false)
const submitError = ref('')

function openSubmitModal() {
  if (editing) {
    // Editing my own theme -> prefill name & description
    if (editing.created_by === userId.value) {
      form.name = editing?.name ?? ''
      form.description = editing?.description ?? ''
    }
    // Forking someone else's theme -> prefill nothing and set the original theme as the fork source
    else {
      form.forked_from = editing.id
    }
  }

  showSubmitModal.value = true
}

async function submitForm() {
  submitError.value = ''

  const validationError = await validate()
  if (validationError.name.invalid)
    return

  submitLoading.value = true

  const payload: Record<string, string | number | null> = {
    // If editing an existing theme that I own, update that theme. Otherwise, create a new theme (optionally as a fork).
    ...(editing && editing.created_by === userId.value && { id: editing.id }),
    ...(form.forked_from && { forked_from: form.forked_from }),
    name: form.name,
    description: form.description,
    custom_css: form.custom_css || '',
    spacing: scaleValues.spacing,
    rounding: scaleValues.rounding,
    transitions: scaleValues.transitions,
    widening: scaleValues.widening,
  }

  for (const key of VUI_COLOR_KEYS) {
    const col = key.replace(HYPHEN_RE, '_')
    payload[`dark_${col}`] = themeForm.dark[key] ?? ''
    payload[`light_${col}`] = themeForm.light[key] ?? ''
  }

  const { error } = await supabase
    .from('themes')
    .upsert(payload)
    .single()

  submitLoading.value = false

  if (error) {
    submitError.value = error.message
    pushToast('Failed to save theme', { description: error.message })
  }
  else {
    refresh()

    if (form.useAsCurrent) {
      applyPaletteLocal('dark', themeForm.dark)
      applyPaletteLocal('light', themeForm.light)
      // Keep the custom CSS that was previewed during editing applied
      applyCustomCss(form.custom_css)
    }

    showSubmitModal.value = false
    emit('saved')
    emit('close')
  }
}

// Reusable template so the content can be moved to a Drawer on phone
const [DefineControls, ThemeEditorControls] = createReusableTemplate()
const isMobile = useBreakpoint('<s')
</script>

<template>
  <div class="theme-editor__controls">
    <DefineControls>
      <div class="theme-editor__header">
        <Flex y-center x-between gap="xs">
          <h4 class="mr-m">
            Theme editor
          </h4>

          <ButtonGroup>
            <Tooltip>
              <Button square size="s" :outline="activeType === 'light'" @click="setColorTheme('dark')">
                <Icon name="ph:moon" />
              </Button>
              <template #tooltip>
                <p>Dark variant</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button square size="s" :outline="activeType === 'dark'" @click="setColorTheme('light')">
                <Icon name="ph:sun" />
              </Button>
              <template #tooltip>
                <p>Light variant</p>
              </template>
            </Tooltip>
          </ButtonGroup>

          <Tooltip>
            <Button size="s" square @click="reset">
              <Icon name="ph:arrow-clockwise" />
            </Button>
            <template #tooltip>
              <p>Reset changes</p>
            </template>
          </Tooltip>

          <!-- TODO: enable later -->
          <!-- <Tooltip>
          <Button size="s" square @click="reset">
            <Icon name="ph:arrow-square-out" />
          </Button>
          <template #tooltip>
            <p style="max-width: 256px">
              Popout editor. Browse the website while editing your theme
            </p>
          </template>
        </Tooltip> -->

          <div class="flex-1" />

          <Button v-if="isMobile" size="s" variant="accent" @click="openSubmitModal">
            Finalize
          </Button>

          <Button v-else square size="s" plain @click="close">
            <Icon name="ph:x" />
          </Button>
        </Flex>

        <Tabs v-model="activeTab" class="theme-editor__tabs">
          <Tab value="tokens">
            Tokens
          </Tab>
          <Tab value="css">
            CSS
          </Tab>
        </Tabs>
      </div>

      <!-- Scrollable color + scale list -->
      <div class="theme-editor__groups--outer">
        <!-- CSS editor -->
        <div v-show="activeTab === 'css'" class="theme-editor__groups--inner">
          <CodeEditorClient v-model="form.custom_css" :focused="activeTab === 'css'" />
        </div>

        <!-- Token editor -->
        <div v-show="activeTab === 'tokens'" class="theme-editor__groups--inner">
          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Spacing</span>
            <Flex y-center gap="l">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.spacing"
                :style="rangeProgressStyle('spacing')"
                @input="onScaleChange('spacing', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('spacing') }}</span>
            </Flex>
          </div>

          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Rounding</span>
            <Flex y-center gap="l">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.rounding"
                :style="rangeProgressStyle('rounding')"
                @input="onScaleChange('rounding', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('rounding') }}</span>
            </Flex>
          </div>

          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Transitions</span>
            <Flex y-center gap="l">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.transitions"
                :style="rangeProgressStyle('transitions')"
                @input="onScaleChange('transitions', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('transitions') }}</span>
            </Flex>
          </div>

          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Widening</span>
            <Flex y-center gap="l">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.widening"
                :style="rangeProgressStyle('widening')"
                @input="onScaleChange('widening', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('widening') }}</span>
            </Flex>
          </div>

          <Divider :size="0" />

          <div
            v-for="(colors, groupName) in COLOR_GROUPS"
            :key="groupName"
            class="theme-editor__group"
          >
            <span class="theme-editor__group-label">{{ groupName }}</span>
            <Flex column gap="xxs">
              <label
                v-for="colorKey in colors"
                :key="colorKey"
                class="theme-editor__input"
              >
                <input
                  type="color"
                  :value="themeForm[activeType][colorKey]"
                  @input="onColorChange(colorKey, ($event.target as HTMLInputElement).value)"
                >
                <span>{{ colorKey }}</span>
              </label>
            </Flex>
          </div>
        </div>
      </div>

      <div class="theme-editor__footer">
        <div v-if="showCustomCSSWarning" class="theme-editor__footer-css-consent">
          <Flex x-between y-center>
            <span class="theme-editor__group-label">CSS settings</span>
            <Button square size="s" plain @click="showCustomCSSWarning = false">
              <Icon name="ph:x" />
            </Button>
          </Flex>
          <Checkbox v-model="settings.allow_custom_css" accent class="mb-s" label="Enable custom CSS" />
          <p class="vui-hint" style="opacity: 0.7;">
            If disabled, you will not be able to use or preview custom CSS styles. This can be changed in your user settings.
          </p>
        </div>
        <Flex x-end>
          <Button size="s" plain variant="danger" @click="close">
            Cancel
          </Button>
          <Button variant="accent" size="s" @click="openSubmitModal">
            Save
          </Button>
        </Flex>
      </div>
    </DefineControls>

    <!-- Mobile -->
    <template v-if="isMobile">
      <Drawer
        container-class="theme-editor__drawer-container"
        open :root-props="{ dismissible: false,
                            modal: false,
                            activeSnapPoint: 0.2,
                            snapPoints: [0.2, 0.35, 0.5, 0.75],
        }"
      >
        <ThemeEditorControls />
      </Drawer>
    </template>

    <!-- Desktop -->
    <template v-else>
      <ThemeEditorControls />
    </template>

    <!-- Submit / details modal -->
    <Modal :open="showSubmitModal" size="s" :card="{ separators: true }" @close="showSubmitModal = false">
      <template #header>
        <h4>Details</h4>
        <p class="text-color-lighter">
          Describe your theme
        </p>
      </template>

      <Flex column gap="m">
        <Alert v-if="submitError" variant="danger">
          {{ submitError }}
        </Alert>

        <Alert v-if="form.forked_from" variant="info" filled icon-align="start">
          <p>
            This theme is based on {{ editing?.name }} created by
            <b><UserName inherit :user-id="editing?.created_by" /></b>
          </p>
        </Alert>

        <Input
          v-model="form.name"
          placeholder="My Cool Theme"
          expand
          label="Name"
          :errors="normalizeErrors(errors.name)"
          required
        />

        <Textarea
          v-model="form.description"
          placeholder="Briefly describe your theme and its features"
          :rows="5"
          :resize="false"
          expand
          label="Description"
          :errors="normalizeErrors(errors.description)"
        />

        <Card class="card-bg">
          <Switch v-model="form.useAsCurrent" label="Set as current theme" />
        </Card>
      </Flex>

      <template #footer>
        <Flex x-end>
          <Button plain @click="showSubmitModal = false">
            Close
          </Button>
          <Button variant="accent" :loading="submitLoading" @click="submitForm">
            {{ editing ? 'Save' : 'Publish' }}
          </Button>
        </Flex>
      </template>
    </Modal>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.theme-editor {
  &__controls {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--color-border);
    height: 100vh;
    background-color: var(--color-bg-medium);
    position: relative;
  }

  &__groups {
    &--outer {
      flex: 1;
      position: relative;
    }

    &--inner {
      position: absolute;
      inset: 0;
      overflow-y: auto;
    }
  }

  &__header {
    padding: var(--space-m);
    border-bottom: 1px solid var(--color-border);
  }

  &__group {
    padding: var(--space-m);
  }

  &__group-label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-xs);
  }

  input[type='range'] {
    flex: 1;
  }

  &__range-value {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    min-width: 42px;
    text-align: right;
    flex-shrink: 0;
  }

  &__input {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    cursor: pointer;
    padding: var(--space-xxs);

    &:hover {
      background-color: var(--color-bg-raised);
    }

    span {
      font-size: var(--font-size-m);
    }

    input {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      cursor: pointer;
      background: transparent;
      overflow: hidden;
      border: none;
      padding: 0;

      &::-webkit-color-swatch-wrapper {
        padding: 0;
      }

      &::-webkit-color-swatch {
        border: none;
        padding: 0;
      }

      &::-moz-color-swatch {
        border: none;
        padding: 0;
      }
    }
  }

  &__footer {
    padding: var(--space-m);
    border-top: 1px solid var(--color-border);
  }

  &__footer-css-consent {
    margin-bottom: var(--space-m);
    padding-bottom: var(--space-m);
    position: relative;

    &:after {
      content: '';
      position: absolute;
      bottom: 0;
      left: -16px;
      right: -16px;
      border-bottom: 1px solid var(--color-border);
    }
  }

  &__tabs {
    margin-bottom: -17px;
    margin-top: var(--space-xs);
  }
}

@media screen and (max-width: $breakpoint-s) {
  .theme-editor {
    input[type='range'] {
      width: 100% !important;
    }

    &__drawer-container {
      padding-inline: 0 !important;
    }

    &__controls {
      border: none;
      height: auto;
    }

    &__header {
      position: sticky;
      top: 0;
      background-color: var(--color-bg-medium);
      z-index: 5;
      padding-top: 0;
    }

    &__footer {
      display: none !important;
    }

    &__groups {
      &--outer {
        // height: 100%;
        position: static;
      }

      &--inner {
        position: static;
        overflow: unset;
        inset: usnet;
      }
    }
  }
}
</style>
