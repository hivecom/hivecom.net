<script setup lang="ts">
import type { ThemeScaleKey } from '@/lib/theme'
import type { Theme } from '@/types/theme'
import { maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, ButtonGroup, Card, Checkbox, Divider, Drawer, Flex, Input, Modal, pushToast, setColorTheme, Switch, Tab, Tabs, Textarea, theme, Tooltip } from '@dolanske/vui'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useBreakpoint } from '@/lib/mediaQuery'
import { applyScale, applyTheme, COLOR_GROUPS, dbToPercent, SCALE_CONFIGS, THEME_SCALE_KEYS, VUI_COLOR_KEYS, VUI_DEFAULT_COLORS } from '@/lib/theme'
import { adaptPaletteToTheme } from '@/lib/themeAdapt'
import { normalizeErrors } from '@/lib/utils/formatting'
import CodeEditorClient from '../Shared/CodeEditor.vue'
import ConfirmModal from '../Shared/ConfirmModal.vue'
import UserName from '../Shared/UserName.vue'

const emit = defineEmits<{
  saved: []
}>()

const HYPHEN_RE = /-/g

type ThemeType = 'dark' | 'light'

const { refresh } = useDataThemes()
const { settings } = useDataUserSettings()
const { activeTheme, reapplyCustomCss, applyCustomCss, fetchAndApply } = useUserTheme()
const {
  themeForm,
  scaleValues,
  activeTab,
  customCss,
  editingTheme,
  seeded,
  editorActive,
  seedPalette,
  applyPaletteLocal,
  themeToForm,
  seedEditor,
  clearEditorState,
} = useThemeEditorState()

const activeType = computed<ThemeType>(() => theme.value === 'light' ? 'light' : 'dark')
const userId = useUserId()

// Submit-modal form fields - intentionally local/ephemeral, not shared.
const form = reactive({
  name: '',
  description: '',
  useAsCurrent: true,
  forked_from: null as string | null,
})

const { validate, errors } = useValidation(form, {
  name: [required, minLenNoSpace(3), maxLength(64)],
  description: [maxLength(128)],
}, {
  autoclear: true,
})

// When the user toggles dark/light, re-seed the newly active palette from
// computed styles (so we pick up VUI defaults for keys we haven't touched),
// then re-apply any overrides we had stored for that palette.
watch(activeType, (prefix) => {
  nextTick(() => {
    const target = themeForm.value[prefix]
    seedPalette(prefix, target)
    applyPaletteLocal(prefix, target)
  })
})

// Immediately update CSS on the document to reflect the color change
function onColorChange(key: string, value: string) {
  themeForm.value[activeType.value][key] = value
  document.documentElement.style.setProperty(`--${activeType.value}-color-${key}`, value)
}

// Formatted display percentage for a given scale key
function scaleDisplay(key: ThemeScaleKey): string {
  return `${Math.round(dbToPercent(scaleValues.value[key], key))}%`
}

// Compute --range-progress style for a range input
function rangeProgressStyle(key: ThemeScaleKey): Record<string, string> {
  return { '--range-progress': `${scaleValues.value[key]}%` }
}

// Called when a range slider changes
function onScaleChange(key: ThemeScaleKey, value: number) {
  const intValue = Math.round(value)
  scaleValues.value[key] = intValue
  applyScale(key, intValue)
}

// Apply the opposite theme's palette onto the current active theme,
// intelligently remapping lightness values to suit the target variant while
// preserving hue and saturation so custom-tinted themes stay coherent.
function applyOtherTheme() {
  const current = activeType.value
  const other: ThemeType = current === 'light' ? 'dark' : 'light'
  const otherPalette = themeForm.value[other]

  const adapted = adaptPaletteToTheme(otherPalette, current)

  for (const key of Object.keys(adapted)) {
    const value = adapted[key]
    if (value == null)
      continue
    themeForm.value[current][key] = value
    document.documentElement.style.setProperty(`--${current}-color-${key}`, value)
  }

  const otherLabel = other.charAt(0).toUpperCase() + other.slice(1)
  pushToast(`${otherLabel} theme colors adapted to ${current} theme`)
}

const showCustomCSSWarning = ref(false)

onMounted(() => {
  // Only seed on first mount; if seeded=true, shared state is already live
  // (e.g. switching from modal to layout mode, or re-opening after seedEditor
  // was called by the parent before mounting).
  if (!seeded.value) {
    seedEditor()
  }

  if (settings.value && !settings.value.allow_custom_css) {
    showCustomCSSWarning.value = true
  }
})

// Apply custom CSS as the user types.
watch(customCss, (css) => {
  applyCustomCss(css)
})

function reset() {
  if (editingTheme.value) {
    // Restore to the saved state of the theme being edited
    themeToForm(editingTheme.value)
    applyPaletteLocal('dark', themeForm.value.dark)
    applyPaletteLocal('light', themeForm.value.light)

    for (const key of THEME_SCALE_KEYS) {
      scaleValues.value[key] = editingTheme.value[key] ?? SCALE_CONFIGS[key].defaultDb
      applyScale(key, scaleValues.value[key])
    }

    customCss.value = editingTheme.value.custom_css ?? ''
  }
  else {
    applyTheme(null)

    for (const key of THEME_SCALE_KEYS) {
      scaleValues.value[key] = SCALE_CONFIGS[key].defaultDb
      applyScale(key, scaleValues.value[key])
    }

    seedPalette('dark', themeForm.value.dark)
    seedPalette('light', themeForm.value.light)
    applyPaletteLocal('dark', themeForm.value.dark)
    applyPaletteLocal('light', themeForm.value.light)

    customCss.value = ''
  }

  Object.assign(form, {
    name: '',
    description: '',
    useAsCurrent: true,
    forked_from: null,
  })
}

function close() {
  applyTheme(activeTheme.value ?? null)
  reapplyCustomCss()
  clearEditorState()
  editorActive.value = false
}

// DB operations
const supabase = useSupabaseClient()
const subscriptionsCache = useDiscussionSubscriptionsCache()

const showSubmitModal = ref(false)
const submitLoading = ref(false)
const submitError = ref('')

function openSubmitModal() {
  if (editingTheme.value) {
    // Editing my own theme -> prefill name & description
    if (editingTheme.value.created_by === userId.value) {
      form.name = editingTheme.value.name ?? ''
      form.description = editingTheme.value.description ?? ''
    }
    // Forking someone else's theme -> set the original theme as the fork source
    else if (editingTheme.value.id !== '$default') {
      form.forked_from = editingTheme.value.id
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
    ...(form.forked_from && { forked_from: form.forked_from }),
    name: form.name,
    description: form.description,
    custom_css: customCss.value || '',
    spacing: scaleValues.value.spacing,
    rounding: scaleValues.value.rounding,
    transitions: scaleValues.value.transitions,
    widening: scaleValues.value.widening,
  }

  for (const key of VUI_COLOR_KEYS) {
    const col = key.replace(HYPHEN_RE, '_')
    payload[`dark_${col}`] = themeForm.value.dark[key] ?? ''
    payload[`light_${col}`] = themeForm.value.light[key] ?? ''
  }

  const isUpdate = !!(editingTheme.value && editingTheme.value.created_by === userId.value)

  let themeId: string | null = null
  let error = null

  if (isUpdate) {
    const { error: updateError } = await supabase
      .from('themes')
      .update(payload)
      .eq('id', editingTheme.value!.id)

    error = updateError
    themeId = editingTheme.value!.id
  }
  else {
    const { data: insertedTheme, error: insertError } = await supabase
      .from('themes')
      .insert(payload)
      .select('id')
      .single()

    error = insertError
    themeId = insertedTheme?.id ?? null
  }

  submitLoading.value = false

  if (error) {
    submitError.value = error.message
    pushToast('Failed to save theme', { description: error.message })
  }
  else {
    if (!isUpdate && userId.value)
      subscriptionsCache.invalidateList(userId.value)

    refresh()

    if (form.useAsCurrent && themeId) {
      if (!isUpdate && userId.value) {
        await supabase
          .from('profiles')
          .update({ theme_id: themeId })
          .eq('id', userId.value)
      }
      await fetchAndApply(true)
    }

    showSubmitModal.value = false

    emit('saved')

    if (themeId) {
      await navigateTo(`/themes/${themeId}`)
      close()
    }
  }
}

function resetColor(colorKey: string) {
  const col = `${activeType.value}_${colorKey.replace(HYPHEN_RE, '_')}` as keyof typeof editingTheme.value
  const savedValue = editingTheme.value
    ? editingTheme.value[col]
    : VUI_DEFAULT_COLORS[activeType.value][colorKey]

  if (savedValue)
    onColorChange(colorKey, savedValue)
}

const showCloseConfirm = ref(false)

// Reusable template so the content can be moved to a Drawer on phone
const [DefineControls, ThemeEditorControls] = createReusableTemplate()
const [DefineHeaderItems, ThemeHeaderItems] = createReusableTemplate()
const isMobile = useBreakpoint('<s')

const ICON_COLOR_KEYS = [
  'accent',
  'text_yellow',
  'text_red',
  'text_blue',
  'bg_lowered',
  'bg',
  'bg_medium',
  'bg_raised',
  'text',
  'text_light',
  'text_lighter',
  'text_lightest',
  'text_invert',
  'text_green',
  'border',
  'border_strong',
  'border_weak',
  'button_fill',
  'button_fill_hover',
  'button_gray',
  'button_gray_hover',
  'bg_accent_lowered',
  'bg_accent_raised',
  'bg_red_lowered',
  'bg_red_raised',
  'bg_yellow_lowered',
  'bg_yellow_raised',
  'bg_blue_lowered',
  'bg_blue_raised',
  'bg_green_lowered',
  'bg_green_raised',
]

const iconTheme = computed<Theme>(() => {
  const entries = ICON_COLOR_KEYS.flatMap(k => [
    [`dark_${k}`, themeForm.value.dark[k.replace(/_/g, '-')] ?? ''],
    [`light_${k}`, themeForm.value.light[k.replace(/_/g, '-')] ?? ''],
  ])
  return {
    id: editingTheme.value?.id ?? '',
    ...Object.fromEntries(entries),
  } as Theme
})
</script>

<template>
  <div class="theme-editor__controls">
    <DefineHeaderItems>
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
        <NuxtLink to="/themes/sample">
          <Button size="s">
            Sample
          </Button>
        </NuxtLink>
        <template #tooltip>
          <p style="max-width: 256px">
            Go to design sample page. You won't lose your theming progress.
          </p>
        </template>
      </Tooltip>
    </DefineHeaderItems>
    <DefineControls>
      <div class="theme-editor__header">
        <Flex y-center x-between gap="xs">
          <Flex y-center gap="xs" class="mr-m">
            <Tooltip v-if="!editingTheme">
              <ThemeIcon :theme="iconTheme" size="s" animated />
              <template #tooltip>
                <p>Your theme icon will be finalized when you submit it</p>
              </template>
            </Tooltip>
            <ThemeIcon v-else :theme="iconTheme" size="s" />
            <h4>Theming</h4>
          </Flex>

          <ThemeHeaderItems v-if="!isMobile" />

          <div class="flex-1" />

          <Button v-if="!isMobile" square size="s" plain @click="showCloseConfirm = true">
            <Icon name="ph:x" />
          </Button>
        </Flex>

        <Tabs v-if="!isMobile" v-model="activeTab" class="theme-editor__tabs">
          <Tab value="tokens">
            Tokens
          </Tab>
          <Tab value="css">
            CSS
          </Tab>
        </Tabs>
        <Flex v-else class="mt-s">
          <Button size="s" square @click="applyOtherTheme">
            <Icon name="ph:magic-wand" />
          </Button>

          <ThemeHeaderItems />

          <Button square size="s" :outline="activeType === 'light'" @click="reset">
            <Icon name="ph:arrow-clockwise" />
          </Button>

          <div class="flex-1" />

          <Button size="s" variant="accent" @click="openSubmitModal">
            Finalize
          </Button>
        </Flex>
      </div>

      <!-- Scrollable color + scale list -->
      <div class="theme-editor__groups--outer">
        <!-- CSS editor -->
        <div v-if="!isMobile" v-show="activeTab === 'css'" class="theme-editor__groups--inner">
          <CodeEditorClient v-model="customCss" :focused="activeTab === 'css'" />
          <p class="vui-hint" style="padding: var(--space-xs) var(--space-s) 0;">
            Block comments (<code>/* ... */</code>) are stripped on save for security reasons.
          </p>
        </div>

        <!-- Token editor -->
        <div v-show="activeTab === 'tokens'" class="theme-editor__groups--inner">
          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Spacing</span>
            <Flex y-center gap="s">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.spacing"
                :style="rangeProgressStyle('spacing')"
                @input="onScaleChange('spacing', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('spacing') }}</span>
              <Button square plain size="s" @click="onScaleChange('spacing', SCALE_CONFIGS.spacing.defaultDb)">
                <Icon name="ph:arrow-clockwise" />
              </Button>
            </Flex>
          </div>

          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Rounding</span>
            <Flex y-center gap="s">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.rounding"
                :style="rangeProgressStyle('rounding')"
                @input="onScaleChange('rounding', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('rounding') }}</span>
              <Button square plain size="s" @click="onScaleChange('rounding', SCALE_CONFIGS.rounding.defaultDb)">
                <Icon name="ph:arrow-clockwise" />
              </Button>
            </Flex>
          </div>

          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Transitions</span>
            <Flex y-center gap="s">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.transitions"
                :style="rangeProgressStyle('transitions')"
                @input="onScaleChange('transitions', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('transitions') }}</span>
              <Button square plain size="s" @click="onScaleChange('transitions', SCALE_CONFIGS.transitions.defaultDb)">
                <Icon name="ph:arrow-clockwise" />
              </Button>
            </Flex>
          </div>

          <div class="theme-editor__group">
            <span class="theme-editor__group-label">Widening</span>
            <Flex y-center gap="s">
              <input
                type="range" min="0" max="100" class="w-100"
                :value="scaleValues.widening"
                :style="rangeProgressStyle('widening')"
                @input="onScaleChange('widening', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="theme-editor__range-value">{{ scaleDisplay('widening') }}</span>
              <Button square plain size="s" @click="onScaleChange('widening', SCALE_CONFIGS.widening.defaultDb)">
                <Icon name="ph:arrow-clockwise" />
              </Button>
            </Flex>
          </div>

          <Divider />

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

                <div class="flex-1" />
                <Button square size="s" plain @click="resetColor(colorKey)">
                  <Icon name="ph:arrow-clockwise" />
                </Button>
              </label>
            </Flex>
          </div>
        </div>
      </div>

      <div class="theme-editor__footer">
        <div v-if="showCustomCSSWarning" class="theme-editor__footer-css-consent">
          <span class="theme-editor__group-label">CSS settings</span>
          <Checkbox v-model="settings.allow_custom_css" accent class="mb-s" label="Enable custom CSS" />
          <p class="vui-hint" style="opacity: 0.7;">
            If disabled, you will not be able to use or preview custom CSS styles. This can be changed in your user settings.
          </p>
        </div>
        <Flex x-end>
          <Tooltip>
            <Button size="s" square @click="applyOtherTheme">
              <Icon name="ph:magic-wand" />
            </Button>
            <template #tooltip>
              <p style="max-width:256px">
                Apply {{ activeType === 'light' ? 'dark' : 'light' }} theme colors to current variant. <strong>Caution!</strong> This action will overwrite your current changes.
              </p>
            </template>
          </Tooltip>
          <div class="flex-1" />
          <Button size="s" plain variant="danger" @click="reset">
            Reset
          </Button>
          <Button variant="accent" size="s" @click="openSubmitModal">
            Save
          </Button>
        </Flex>
      </div>
    </DefineControls>

    <!-- Mobile -->
    <Drawer
      v-if="isMobile"
      container-class="theme-editor__drawer-container"
      open :root-props="{ dismissible: false,
                          modal: false,
                          activeSnapPoint: 0.2,
                          snapPoints: [0.2, 0.35, 0.5, 0.75],
      }"
    >
      <ThemeEditorControls />
    </Drawer>

    <!-- Desktop -->
    <ThemeEditorControls v-else />

    <ConfirmModal
      :open="showCloseConfirm"
      title="Discard changes?"
      description="Any unsaved changes to your theme will be lost."
      confirm-text="Discard"
      cancel-text="Keep editing"
      :destructive="true"
      @confirm="close"
      @cancel="showCloseConfirm = false"
    />

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
            This theme is based on {{ editingTheme?.name }} created by
            <b><UserName inherit :user-id="editingTheme?.created_by" /></b>
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
            {{ editingTheme ? 'Save' : 'Publish' }}
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
    position: relative;
    padding-bottom: 48px;
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
    position: relative;
    padding: var(--space-xxs);

    &:hover {
      background-color: var(--color-bg-raised);

      .vui-button {
        display: block;
      }
    }

    span {
      font-size: var(--font-size-m);
    }

    // Hide button by default, show on hover
    .vui-button {
      display: none;
      position: absolute;
      right: 2px;
      top: 50%;
      transform: translateY(-50%);
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
    position: absolute;
    bottom: -1px;
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
      padding-bottom: var(--space-s);
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
