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
    <div>
      Theme
      <Icon :icon="isLight ? 'ph:sun' : 'ph:moon'" />
    </div>
  </Switch>
</template>
