<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Select, theme, Tooltip } from '@dolanske/vui'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useDataThemes } from '@/composables/useDataThemes'
import { VUI_COLOR_KEYS } from '@/lib/theme'

const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
const HYPHEN_RE = /-/g

/**
 * Read the current computed value of a CSS variable from :root and convert
 * it to a hex string suitable for <input type="color">.
 */
function getCssVarAsHex(varName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw)
    return '#000000'

  // Parse rgb(...) / rgba(...)
  const match = raw.match(RGB_RE)
  if (match) {
    const r = Number(match[1])
    const g = Number(match[2])
    const b = Number(match[3])
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  // If it's already hex-ish, return as-is
  if (raw.startsWith('#'))
    return raw

  return '#000000'
}

// Track active palette via VUI's reactive theme ref
const activePrefix = computed(() => theme.value === 'dark' ? 'dark' : 'light')

// ── Color groups ──────────────────────────────────────────────────────────────

// Group the color keys into logical sections for the UI
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

// Store overrides per palette independently so toggling doesn't lose work
const darkColors: Record<string, string> = reactive({})
const lightColors: Record<string, string> = reactive({})

// ── Theme preset dropdown ─────────────────────────────────────────────────────

const { themes, loading: themesLoading } = useDataThemes()

const selectedThemeId = ref<string | null>(null)

const themeOptions = computed(() => themes.value.map(t => ({ label: t.name, value: t.id })))

function loadThemeIntoPalettes(t: Tables<'themes'>) {
  for (const key of VUI_COLOR_KEYS) {
    const darkCol = `dark_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
    const lightCol = `light_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
    darkColors[key] = (t[darkCol] as string) ?? darkColors[key]
    lightColors[key] = (t[lightCol] as string) ?? lightColors[key]
  }
  applyPalette('dark', darkColors)
  applyPalette('light', lightColors)
}

function onThemeSelect(selected: { value: unknown, label: string }[] | undefined) {
  const id = (selected?.[0]?.value as string | null) ?? null
  if (id == null) {
    resetAll()
    return
  }
  selectedThemeId.value = id
  const t = themes.value.find(th => th.id === id)
  if (t == null)
    return
  loadThemeIntoPalettes(t)
}

// The colors object the template binds to - points at the active palette
const colors = computed(() => activePrefix.value === 'dark' ? darkColors : lightColors)

function seedPalette(prefix: 'dark' | 'light', target: Record<string, string>) {
  for (const key of VUI_COLOR_KEYS) {
    const cssVar = `--${prefix}-color-${key}`
    target[key] = getCssVarAsHex(cssVar)
  }
}

function applyPalette(prefix: 'dark' | 'light', source: Record<string, string>) {
  for (const key of VUI_COLOR_KEYS) {
    const cssVar = `--${prefix}-color-${key}`
    if (source[key] != null)
      document.documentElement.style.setProperty(cssVar, source[key])
  }
}

// Seed both palettes on mount - deferred to onMounted so getComputedStyle is available
onMounted(() => {
  seedPalette('dark', darkColors)
  seedPalette('light', lightColors)
})

// When the user toggles dark/light, re-seed the newly active palette from
// computed styles (so we pick up VUI defaults for keys we haven't touched),
// then re-apply any overrides we had stored for that palette.
watch(activePrefix, (prefix) => {
  nextTick(() => {
    const target = prefix === 'dark' ? darkColors : lightColors
    seedPalette(prefix, target)
    applyPalette(prefix, target)
  })
})

function onColorChange(key: string, value: string) {
  colors.value[key] = value
  const cssVar = `--${activePrefix.value}-color-${key}`
  document.documentElement.style.setProperty(cssVar, value)
}

function resetAll() {
  selectedThemeId.value = null
  for (const key of VUI_COLOR_KEYS) {
    for (const prefix of ['dark', 'light'] as const) {
      document.documentElement.style.removeProperty(`--${prefix}-color-${key}`)
    }
  }
  seedPalette('dark', darkColors)
  seedPalette('light', lightColors)
  applyPalette('dark', darkColors)
  applyPalette('light', lightColors)
}

// Clean up overrides when leaving the page
onBeforeUnmount(() => {
  for (const key of VUI_COLOR_KEYS) {
    for (const prefix of ['dark', 'light'] as const) {
      document.documentElement.style.removeProperty(`--${prefix}-color-${key}`)
    }
  }
})
</script>

<template>
  <div style="padding-block: 128px; width: 100%">
    <div class="container container-m">
      <Flex column gap="l" expand>
        <Flex column expand>
          <Flex expand x-between y-center wrap>
            <h1>Theme Playground</h1>
            <Flex y-center wrap gap="xs">
              <Select
                :options="themeOptions"
                :disabled="themesLoading"
                single
                show-clear
                placeholder="Load a theme..."
                style="min-width: 200px"
                @update:model-value="onThemeSelect"
              />
              <Tooltip>
                <template #tooltip>
                  <p>Reset all overrides and start fresh</p>
                </template>
                <Button square variant="gray" outline @click="resetAll">
                  <Icon name="ph:arrow-clockwise" size="18" />
                </Button>
              </Tooltip>
              <SharedThemeToggle button no-text />
            </Flex>
          </Flex>
          <p class="text-s text-color-light" style="margin-top: var(--space-xxs)">
            Editing <strong class="palette-name">{{ activePrefix }}</strong> palette - toggle your theme to switch. Changes are live, not persisted.
          </p>
        </Flex>

        <div class="color-groups-grid">
          <Card
            v-for="(keys, group) in COLOR_GROUPS"
            :key="group"
            class="color-group"
          >
            <h3 class="color-group-title">
              {{ group }}
            </h3>
            <Flex column gap="xs">
              <label
                v-for="key in keys"
                :key="`${activePrefix}-${key}`"
                class="color-entry"
              >
                <input
                  type="color"
                  :value="colors[key]"
                  class="color-swatch"
                  @input="onColorChange(key, ($event.target as HTMLInputElement).value)"
                >
                <span class="text-s">{{ key }}</span>
              </label>
            </Flex>
          </Card>
        </div>

        <!-- Preview area so you can see changes in context -->
        <Card class="color-group">
          <h3 class="color-group-title">
            Preview
          </h3>
          <Flex column gap="m">
            <Flex gap="s" wrap>
              <Button variant="gray">
                Gray
              </Button>
              <Button variant="fill">
                Fill
              </Button>
              <Button variant="accent">
                Accent
              </Button>
              <Button variant="success">
                Success
              </Button>
              <Button variant="danger">
                Danger
              </Button>
            </Flex>
            <Flex gap="s" wrap>
              <div class="preview-swatch preview-swatch--bg">
                bg
              </div>
              <div class="preview-swatch preview-swatch--bg-medium">
                bg-medium
              </div>
              <div class="preview-swatch preview-swatch--bg-raised">
                bg-raised
              </div>
              <div class="preview-swatch preview-swatch--bg-lowered">
                bg-lowered
              </div>
            </Flex>
            <p>
              Regular text.
              <span class="text-color-light">Light text.</span>
              <span class="text-color-lighter">Lighter text.</span>
              <span class="text-color-lightest">Lightest text.</span>
            </p>
            <div class="preview-border-box">
              A box with <code>--color-border</code>
            </div>
          </Flex>
        </Card>
      </Flex>
    </div>
  </div>
</template>

<style scoped lang="scss">
.palette-name {
  font-size: inherit;
  color: var(--color-text);
}

.color-group {
  padding: var(--space-m);
}

.color-groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-m);
  width: 100%;
}

.color-group-title {
  font-size: var(--font-size-m);
  font-weight: 600;
  margin-bottom: var(--space-s);
}

.color-entry {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  cursor: pointer;
}

.color-swatch {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  padding: 2px;
  cursor: pointer;
  background: transparent;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  &::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }

  &::-moz-color-swatch {
    border: none;
    border-radius: 2px;
  }
}

.preview-swatch {
  padding: var(--space-s) var(--space-m);
  border-radius: var(--border-radius-s);
  font-size: var(--font-size-s);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.preview-swatch--bg {
  background: var(--color-bg);
}
.preview-swatch--bg-medium {
  background: var(--color-bg-medium);
}
.preview-swatch--bg-raised {
  background: var(--color-bg-raised);
}
.preview-swatch--bg-lowered {
  background: var(--color-bg-lowered);
}

.preview-border-box {
  padding: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  font-size: var(--font-size-s);
}
</style>
