<script setup lang="ts">
import { setColorTheme, Switch, theme } from '@dolanske/vui'
import { Icon } from '@iconify/vue'

const isLight = computed({
  get: () => theme.value === 'light',
  set: value => setColorTheme(value ? 'light' : 'dark'),
})
</script>

<template>
  <Switch v-model="isLight" data-title-top="Switch theme">
    <template #start />
    <div class="theme-toggle-switch">
      Theme
      <Icon :icon="isLight ? 'ph:sun' : 'ph:moon'" />
    </div>
  </Switch>
</template>

<style scoped lang="scss">
.theme-toggle-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);

  .vui-switch {
    margin-right: 0.5rem;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--vui-color-text);
  }
}
</style>
