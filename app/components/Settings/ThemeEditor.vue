<script setup lang="ts">
import { Button, ButtonGroup, Dropdown, DropdownItem, Flex, Input, Modal, setColorTheme, theme, Tooltip } from '@dolanske/vui'
import { getCssVarAsHex, VUI_COLOR_KEYS } from '@/lib/theme'
import ThemeSampleUI from './ThemeSampleUI.vue'

interface Props {
  open: boolean
}

type ThemeType = 'dark' | 'light'

const {
  open,
} = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// Themes dropdown
const { themes, loading, refresh } = useDataThemes()

const activeType = computed<ThemeType>(() => theme.value === 'light' ? 'light' : 'dark')

const themeName = ref('')

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

// Reset the theme on unmount
onBeforeUnmount(() => {
  for (const key of VUI_COLOR_KEYS) {
    for (const prefix of ['dark', 'light'] as const) {
      document.documentElement.style.removeProperty(`--${prefix}-color-${key}`)
    }
  }
})

function reset() {
  // selectedThemeId.value = null
  for (const key of VUI_COLOR_KEYS) {
    for (const prefix of ['dark', 'light'] as const) {
      document.documentElement.style.removeProperty(`--${prefix}-color-${key}`)
    }
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
const submitLoading = ref(false)
const supabase = useSupabaseClient()

function submitTheme() {
  submitLoading.value = true

  // TODO: serialize back to DB format
  // TODO: submit to DB
  // TODO: show confirm dialog to apply theme or close editor

  // supabase.from('themes')
  //   .upsert()
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

              <!-- TODO: show author & when it was released on a row below the name -->
              <DropdownItem v-for="item in themes" :key="item.id">
                {{ item.name }}
              </DropdownItem>

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

        <div class="theme-editor__groups--outer">
          <div class="theme-editor__groups--inner">
            <div
              v-for="(colors, groupName) in COLOR_GROUPS"
              :key="groupName"
              class="theme-editor__group"
            >
              <span class="text-xs text-color-lighter mb-xs block">{{ groupName }}</span>
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
          <Input v-model="themeName" expand placeholder="My Awesome Theme" />
          <Button variant="accent" :disabled="themeName.length === 0" :loading="submitLoading">
            Save
          </Button>
        </Flex>
      </div>
    </div>
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

  &__input {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    cursor: pointer;
    padding: var(--space-xxs);
    /* border-radius: var(--border-radius-s); */

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
