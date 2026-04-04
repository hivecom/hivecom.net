<script setup lang="ts">
import type { ThemeScaleKey } from '@/lib/theme'
import type { Tables } from '@/types/database.overrides'
import { maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, ButtonGroup, Card, Divider, Flex, Input, Modal, pushToast, setColorTheme, Switch, Textarea, theme, Tooltip } from '@dolanske/vui'
import { applyScale, applyTheme, dbToPercent, getCssVarAsHex, SCALE_CONFIGS, THEME_SCALE_KEYS, VUI_COLOR_KEYS } from '@/lib/theme'
import { normalizeErrors } from '@/lib/utils/formatting'

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
const { activeTheme } = useUserTheme()

const activeType = computed<ThemeType>(() => theme.value === 'light' ? 'light' : 'dark')

const themeForm = reactive<Record<ThemeType, Record<string, string>>>({
  light: {},
  dark: {},
})

const scaleValues = reactive<Record<ThemeScaleKey, number>>({
  spacing: SCALE_CONFIGS.spacing.defaultDb,
  rounding: SCALE_CONFIGS.rounding.defaultDb,
  transitions: SCALE_CONFIGS.transitions.defaultDb,
  widening: SCALE_CONFIGS.widening.defaultDb,
})

// Logically group colors and their key definitions for the UI
const COLOR_GROUPS: Record<string, typeof VUI_COLOR_KEYS[number][]> = {
  Background: ['bg', 'bg-medium', 'bg-raised', 'bg-lowered'],
  Text: ['text', 'text-light', 'text-lighter', 'text-lightest', 'text-invert'],
  Buttons: ['button-gray', 'button-gray-hover', 'button-fill', 'button-fill-hover'],
  Red: ['text-red', 'bg-red-lowered', 'bg-red-raised'],
  Green: ['text-green', 'bg-green-lowered', 'bg-green-raised'],
  Yellow: ['text-yellow', 'bg-yellow-lowered', 'bg-yellow-raised'],
  Blue: ['text-blue', 'bg-blue-lowered', 'bg-blue-raised'],
  Border: ['border', 'border-strong', 'border-weak'],
  Accent: ['accent', 'bg-accent-lowered', 'bg-accent-raised'],
}

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

/** Formatted display percentage for a given scale key */
function scaleDisplay(key: ThemeScaleKey): string {
  return `${Math.round(dbToPercent(scaleValues[key], key))}%`
}

/** Compute --range-progress style for a range input */
function rangeProgressStyle(key: ThemeScaleKey): Record<string, string> {
  return { '--range-progress': `${scaleValues[key]}%` }
}

/** Called when a range slider changes */
function onScaleChange(key: ThemeScaleKey, value: number) {
  scaleValues[key] = value
  applyScale(key, value)
}

onMounted(() => seed())

/** Seed all editor state (colors + scales) from the editing prop or active theme */
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
}

function reset() {
  applyTheme(null)

  for (const key of THEME_SCALE_KEYS) {
    scaleValues[key] = SCALE_CONFIGS[key].defaultDb
  }

  seedPalette('dark', themeForm.dark)
  seedPalette('light', themeForm.light)
  applyPaletteLocal('dark', themeForm.dark)
  applyPaletteLocal('light', themeForm.light)
}

function close() {
  applyTheme(activeTheme.value ?? null)
  emit('close')
}

// DB operations
const supabase = useSupabaseClient()

const showSubmitModal = ref(false)
const submitLoading = ref(false)
const submitError = ref('')

const form = reactive({ name: '', description: '', useAsCurrent: true })

const { validate, errors } = useValidation(form, {
  name: [required, minLenNoSpace(3), maxLength(64)],
  description: [maxLength(128)],
}, {
  autoclear: true,
})

function openSubmitModal() {
  form.name = editing?.name ?? ''
  form.description = editing?.description ?? ''
  showSubmitModal.value = true
}

async function submitForm() {
  submitError.value = ''

  const validationError = await validate()
  if (validationError.name.invalid)
    return

  submitLoading.value = true

  const payload: Record<string, string | number> = {
    ...(editing && { id: editing.id }),
    name: form.name,
    description: form.description,
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
    }

    showSubmitModal.value = false
    emit('saved')
    emit('close')
  }
}
</script>

<template>
  <div class="theme-editor__controls">
    <Flex y-center x-between gap="xs" class="theme-editor__header">
      <h4 class="mr-m">
        Editor
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
          <p>Reset</p>
        </template>
      </Tooltip>

      <Tooltip>
        <Button size="s" square @click="reset">
          <Icon name="ph:arrow-square-out" />
        </Button>
        <template #tooltip>
          <p style="max-width: 256px">
            Popout editor. Browse the website while editing your theme
          </p>
        </template>
      </Tooltip>

      <div class="flex-1" />

      <Button square size="s" plain @click="close">
        <Icon name="ph:x" />
      </Button>
    </Flex>

    <!-- Scrollable color + scale list -->
    <div class="theme-editor__groups--outer">
      <div class="theme-editor__groups--inner">
        <div class="theme-editor__group">
          <span class="theme-editor__group-label">Spacing</span>
          <Flex y-center gap="l">
            <input
              type="range" min="0" max="100"
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
              type="range" min="0" max="100"
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
              type="range" min="0" max="100"
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
              type="range" min="0" max="100"
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

    <Flex x-end class="theme-editor__footer">
      <Button variant="accent" @click="openSubmitModal">
        Finalize
        <template #end>
          <Icon name="ph:arrow-right" :size="18" />
        </template>
      </Button>
    </Flex>
  </div>

  <!-- Submit / details modal -->
  <Modal :open="showSubmitModal" size="s" :card="{ separators: true }" @close="showSubmitModal = false">
    <template #header>
      <h4>Details</h4>
      <p class="text-color-lighter">
        Describe your theme
      </p>
    </template>

    <Alert v-if="submitError" variant="danger">
      {{ submitError }}
    </Alert>

    <Input
      v-model="form.name"
      placeholder="My Cool Theme"
      class="mb-m"
      expand
      label="Name"
      :errors="normalizeErrors(errors.name)"
      required
    />
    <Textarea
      v-model="form.description"
      class="mb-m"
      placeholder="Briefly describe your theme and its features"
      :rows="5"
      :resize="false"
      expand
      label="Description"
      :errors="normalizeErrors(errors.description)"
    />

    <Card>
      <Switch v-model="form.useAsCurrent" label="Set as current theme" />
    </Card>

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
</template>

<style lang="scss">
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
    padding-left: 4px;
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
}
</style>
