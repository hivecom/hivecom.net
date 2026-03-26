<script setup lang="ts">
import type { ThemeScaleKey } from '@/lib/theme'
import type { Tables } from '@/types/database.overrides'
import { maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, ButtonGroup, Card, Divider, Dropdown, Flex, Input, Modal, pushToast, setColorTheme, Switch, Textarea, theme, Tooltip } from '@dolanske/vui'
import { applyScale, applyTheme, dbToPercent, getCssVarAsHex, SCALE_CONFIGS, THEME_SCALE_KEYS, VUI_COLOR_KEYS } from '@/lib/theme'
import { normalizeErrors } from '@/lib/utils/formatting'
import ThemeDropdownItem from './ThemeDropdownItem.vue'
import ThemeSampleUI from './ThemeSampleUI.vue'

const {
  open,
} = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const HYPHEN_RE = /-/g

interface Props {
  open: boolean
}

type ThemeType = 'dark' | 'light'

// Themes dropdown
const { themes, loading, refresh } = useDataThemes()

// Theme name when creating/editing
const form = reactive({ name: '', description: '', useAsCurrent: true })

const activeType = computed<ThemeType>(() => theme.value === 'light' ? 'light' : 'dark')

const editedTheme = reactive<Record<ThemeType, Record<string, string>>>({
  light: {},
  dark: {},
})

// Seed the theme from the currently active theme in both variants
function seedPalette(prefix: 'dark' | 'light', target: Record<string, string>) {
  for (const key of VUI_COLOR_KEYS) {
    const cssVar = `--${prefix}-color-${key}`
    target[key] = getCssVarAsHex(cssVar)
  }
}

// Applies the source palette to the DOM, overwriting the current settings
function applyPalette(prefix: 'dark' | 'light', source: Record<string, string>) {
  for (const key of VUI_COLOR_KEYS) {
    const cssVar = `--${prefix}-color-${key}`
    if (source[key] != null)
      document.documentElement.style.setProperty(cssVar, source[key])
  }
}

onMounted(() => {
  seedPalette('dark', editedTheme.dark)
  seedPalette('light', editedTheme.light)
})

// When the user toggles dark/light, re-seed the newly active palette from
// computed styles (so we pick up VUI defaults for keys we haven't touched),
// then re-apply any overrides we had stored for that palette.
watch(activeType, (prefix) => {
  nextTick(() => {
    const target = editedTheme[prefix]
    seedPalette(prefix, target)
    applyPalette(prefix, target)
  })
})

// Immediately update CSS definitions on the body to reflect change
function onColorChange(key: string, value: string) {
  editedTheme[activeType.value][key] = value
  const cssVar = `--${activeType.value}-color-${key}`
  document.documentElement.style.setProperty(cssVar, value)
}

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

// Ranges - stored as DB values (0-100), default to VUI defaults
const scaleValues = reactive<Record<ThemeScaleKey, number>>({
  spacing: SCALE_CONFIGS.spacing.defaultDb,
  rounding: SCALE_CONFIGS.rounding.defaultDb,
  transitions: SCALE_CONFIGS.transitions.defaultDb,
})

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

/** Load a theme preset from the dropdown into the editor */
function loadTheme(t: Tables<'themes'>) {
  // Apply colors to both palettes
  for (const key of VUI_COLOR_KEYS) {
    const darkCol = `dark_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
    const lightCol = `light_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
    editedTheme.dark[key] = (t[darkCol] as string) ?? editedTheme.dark[key]
    editedTheme.light[key] = (t[lightCol] as string) ?? editedTheme.light[key]
  }

  applyPalette('dark', editedTheme.dark)
  applyPalette('light', editedTheme.light)

  // Apply scale values
  for (const key of THEME_SCALE_KEYS) {
    const dbValue = t[key] ?? SCALE_CONFIGS[key].defaultDb
    scaleValues[key] = dbValue
    applyScale(key, dbValue)
  }

  // Pre-fill theme name
  form.name = t.name
}

function reset() {
  applyTheme(null)

  for (const key of THEME_SCALE_KEYS) {
    scaleValues[key] = SCALE_CONFIGS[key].defaultDb
  }

  seedPalette('dark', editedTheme.dark)
  seedPalette('light', editedTheme.light)
  applyPalette('dark', editedTheme.dark)
  applyPalette('light', editedTheme.light)
}

function resetAndClose() {
  reset()
  emit('close')
}

// Submitting & saving
const supabase = useSupabaseClient()
const userId = useUserId()

const showSubmitModal = ref(false)

const submitLoading = ref(false)
const submitError = ref('')

const { validate, errors } = useValidation(form, {
  name: [required, minLenNoSpace(3), maxLength(64)],
  description: [maxLength(128)],
}, {
  autoclear: true,
})

async function submitForm() {
  submitError.value = ''

  // Run form validation
  const validationError = await validate()

  if (validationError.name.invalid)
    return

  submitLoading.value = true

  const payload: Record<string, string | number> = {
    // TODO: remove later when row policy is updated
    created_by: userId.value!,
    name: form.name,
    spacing: scaleValues.spacing,
    rounding: scaleValues.rounding,
    transitions: scaleValues.transitions,
  }

  for (const key of VUI_COLOR_KEYS) {
    const col = key.replace(HYPHEN_RE, '_')
    payload[`dark_${col}`] = editedTheme.dark[key] ?? ''
    payload[`light_${col}`] = editedTheme.light[key] ?? ''
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
      applyPalette('dark', editedTheme.dark)
      applyPalette('light', editedTheme.light)
    }

    showSubmitModal.value = false
    emit('close')
  }
}
</script>

<template>
  <Modal size="screen" :open class="theme-editor" hide-close-button @close="resetAndClose">
    <div class="theme-editor__layout">
      <div class="container container-s">
        <ThemeSampleUI />
      </div>

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

          <ButtonGroup :gap="2">
            <Dropdown>
              <template #trigger="{ toggle }">
                <Button size="s" @click="toggle">
                  Load
                  <template #end>
                    <Icon name="ph:caret-down" />
                  </template>
                </Button>
              </template>

              <ThemeDropdownItem v-for="item in themes" :key="item.id" :data="item" @click="loadTheme(item)" />

              <p v-if="loading">
                Loading themes...
              </p>

              <p v-else-if="themes.length === 0">
                No themes available
              </p>
            </Dropdown>
            <Tooltip>
              <Button size="s" square @click="reset">
                <Icon name="ph:arrow-clockwise" />
              </Button>

              <template #tooltip>
                Reset to default theme
              </template>
            </Tooltip>
          </ButtonGroup>

          <div class="flex-1" />

          <Button square size="s" plain @click="resetAndClose">
            <Icon name="ph:x" />
          </Button>
        </Flex>

        <!-- Inner editor sidebar list of colors & other values -->
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
                    :value="editedTheme[activeType][colorKey]"
                    @input="onColorChange(colorKey, ($event.target as HTMLInputElement).value)"
                  >
                  <span>{{ colorKey }}</span>
                </label>
              </Flex>
            </div>
          </div>
        </div>

        <Flex x-end class="theme-editor__footer">
          <Button variant="accent" @click="showSubmitModal = true">
            Finalize
            <template #end>
              <Icon name="ph:arrow-right" :size="18" />
            </template>
          </Button>
        </Flex>
      </div>
    </div>
  </Modal>

  <Modal :open="showSubmitModal" size="s" :card="{ separators: true }" @close="showSubmitModal = false">
    <template #header>
      <h4>Details</h4>
    </template>

    <Alert v-if="submitError" variant="danger">
      {{ submitError }}
    </Alert>

    <Input v-model="form.name" placeholder="My Cool Theme" class="mb-m" expand label="Name" :errors="normalizeErrors(errors.name)" required />
    <Textarea v-model="form.description" class="mb-m" placeholder="Describe your theme in a sentence or two" :rows="3" :resize="false" expand label="Description" :errors="normalizeErrors(errors.description)" />

    <Card>
      <Switch v-model="form.useAsCurrent" label="Set as current theme" />
    </Card>

    <template #footer>
      <Flex x-end>
        <Button plain @click="showSubmitModal = false">
          Close
        </Button>
        <Button variant="accent" :loading="submitLoading" @click="submitForm">
          Publish
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss">
// Not scoping styles allows us to override vue internal styles a lot easier
.theme-editor {
  &__layout {
    display: grid;
    grid-template-columns: 1fr 420px;

    .container {
      padding-top: var(--space-xxxl);
      padding-bottom: var(--space-l);
    }
  }

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
    /* min-width: 0; */
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

  /* For the love of me I can't scope it to the modal card */
  .vui-card .vui-card-content {
    padding: 0;
  }

  .example-card {
    display: block;
    width: 100%;
    text-align: center;

    padding: var(--space-l);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    color: var(--color-text-light);

    &.weak {
      border-color: var(--color-border-weak);
      color: var(--color-text-lighter);
    }

    &.strong {
      border-color: var(--color-border-strong);
      color: var(--color-text);
    }

    &.lowered {
      background-color: var(--color-bg-lowered);
    }

    &.raised {
      background-color: var(--color-bg-raised);
    }

    &.medium {
      background-color: var(--color-bg-medium);
    }
  }
}
</style>
