<script setup lang="ts">
import { setColorTheme, Switch, theme } from '@dolanske/vui'

const props = defineProps({
  noText: {
    type: Boolean,
    default: false,
  },
  small: {
    type: Boolean,
    default: false,
  },
})

const isLight = computed({
  get: () => theme.value === 'light',
  set: value => setColorTheme(value ? 'light' : 'dark'),
})
</script>

<template>
  <div :class="`theme-toggle ${props.small ? 'small' : ''}` ">
    <div class="theme-toggle-label">
      <Icon :name="isLight ? 'ph:sun' : 'ph:moon'" />
      <template v-if="!props.noText">
        Theme
      </template>
    </div>
    <Switch v-model="isLight" data-title-top="Switch theme" class="theme-toggle-switch" />
  </div>
</template>

<style scoped lang="scss">
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);

  .theme-toggle-switch {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
  }

  .theme-toggle-label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    color: var(--color-text);
  }

  // This is a super scuffed way of doing this but until VUI has a smaller switch we will be doing this.
  &.small {
    padding: 0;
    gap: 0;
    margin-top: -2px;
    margin-right: 4px;
    width: 32px;
    height: 1.5rem;

    .theme-toggle-label {
      font-size: var(--font-size-sm);
      margin-right: -8px;
    }

    .theme-toggle-switch {
      transform: scale(0.5);
    }
  }
}
</style>
