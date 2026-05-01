<script setup lang="ts">
import { Button, ButtonGroup, Card, Flex, Grid, Select, Tooltip } from '@dolanske/vui'
import ThemeGallery from '@/components/Themes/ThemeGallery.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const userId = useUserId()
const { activeTheme, setActiveTheme, setVariant, selectedVariant, variantOptions } = useUserTheme()
const { transitionTheme } = useThemeTransition()
const { dismissPreview } = useThemePreview()

const variantClickOrigin = ref<{ x: number, y: number } | undefined>(undefined)

function onVariantWrapperClick(e: MouseEvent) {
  variantClickOrigin.value = { x: e.clientX, y: e.clientY }
}

function onResetClick(e: MouseEvent) {
  dismissPreview()
  // setActiveTheme(null) owns its own transitionTheme - wrapping it causes the
  // double-transition guard to block applyTheme(null) silently.
  void setActiveTheme(null, { x: e.clientX, y: e.clientY })
}

const variantWithTransition = computed({
  get() {
    return selectedVariant.value
  },
  set(value: typeof selectedVariant.value) {
    const origin = variantClickOrigin.value
    variantClickOrigin.value = undefined
    if (value[0]) {
      void transitionTheme(() => setVariant(value[0]!.value), origin)
    }
  },
})
const { seedEditor, editorActive } = useThemeEditorState()

const isMobile = useBreakpoint('<s')
const router = useRouter()

function openEditor(theme?: Parameters<typeof seedEditor>[0]) {
  seedEditor(theme ?? null)
  editorActive.value = true
  router.push('/themes/sample')
}
</script>

<template>
  <div class="page container-l">
    <ClientOnly>
      <section class="page-title">
        <h1>
          Themes
        </h1>
        <p>
          Discover community-made themes for Hivecom apps, or create your own!
        </p>
      </section>

      <!-- Theme settings -->
      <Card class="theme-settings-card">
        <Grid :columns="isMobile ? 1 : '1fr 2px 1fr'">
          <Flex class="p-m" x-between y-center gap="xxs" expand :wrap="isMobile">
            <strong :class="isMobile ? 'text-s' : 'text-l'" class="ws-nowrap">
              Current theme:
            </strong>
            <div class="flex-1" />
            <Flex y-center>
              <strong class="text-semibold text-color-accent mr-xs">{{ activeTheme?.name ?? 'Default' }}</strong>
              <ButtonGroup :gap="2">
                <Tooltip v-if="userId">
                  <Button size="s" :square="isMobile" @click="openEditor(activeTheme ?? null)">
                    <Icon v-if="isMobile" name="ph:pen" />
                    <template #start>
                      <Icon v-if="!isMobile" name="ph:pen" />
                    </template>
                    {{ isMobile ? '' : 'Personalize' }}
                  </Button>
                  <template #tooltip>
                    <p>Create a new theme based on the current one</p>
                  </template>
                </Tooltip>
                <Tooltip>
                  <Button size="s" square @click="onResetClick">
                    <Icon name="ph:arrow-clockwise" />
                  </Button>
                  <template #tooltip>
                    <p>Switch back to default theme</p>
                  </template>
                </Tooltip>
              </ButtonGroup>
            </Flex>
          </Flex>
          <div class="divider" />
          <Flex class="p-m" x-between y-center expand :wrap="isMobile">
            <strong :class="isMobile ? 'text-s' : 'text-l'" class="ws-nowrap">
              Variant:
            </strong>
            <div @click.capture="onVariantWrapperClick">
              <Select v-model="variantWithTransition" :show-clear="false" :options="variantOptions" size="s" />
            </div>
          </Flex>
        </Grid>
      </Card>

      <ThemeGallery
        @create="openEditor(null)"
        @edit="openEditor"
      />
    </ClientOnly>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.theme-settings-card {
  background-color: var(--color-bg-card);
  margin-bottom: var(--space-xxl);

  :deep(.vui-card-content) {
    padding: 0;
  }
}

.divider {
  display: block;
  height: 100%;
  background-color: var(--color-border);
  width: 1px;
}

@media screen and (max-width: $breakpoint-s) {
  .divider {
    height: 1px;
    width: 100%;
  }

  .theme-settings-card {
    strong {
      display: block;
    }
  }
}
</style>
