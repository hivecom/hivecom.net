<script setup lang="ts">
import { Button, setColorTheme, Switch, theme } from '@dolanske/vui'

const props = defineProps({
  noText: {
    type: Boolean,
    default: false,
  },
  small: {
    type: Boolean,
    default: false,
  },
  button: {
    type: Boolean,
    default: false,
  },
})

const isLight = computed({
  get: () => theme.value === 'light',
  set: value => setColorTheme(value ? 'light' : 'dark'),
})

function toggleTheme() {
  isLight.value = !isLight.value
}
</script>

<template>
  <div
    class="theme-toggle" :class="{ 'theme-toggle--small': props.small,
                                   'theme-toggle--button': props.button }"
  >
    <ClientOnly>
      <div v-if="!props.button || !props.noText" class="theme-toggle__label">
        <Icon v-if="!props.button" size="1.6rem" :name="isLight ? 'ph:sun' : 'ph:moon'" />
        <template v-if="!props.noText">
          Theme
        </template>
      </div>

      <template v-if="props.button">
        <Button
          square
          outline
          class="theme-toggle__button"
          :aria-label="`Switch to ${isLight ? 'dark' : 'light'} theme`"
          @click="toggleTheme"
        >
          <Icon :name="isLight ? 'ph:sun' : 'ph:moon'" />
        </Button>
      </template>

      <!-- Only render the actual Switch component on client-side -->
      <Switch v-else v-model="isLight" class="theme-toggle__switch" />
      <template #fallback>
        <!-- Static fallback for server-side rendering -->
        <div v-if="!props.button" class="theme-toggle__switch vui-switch" />
        <div v-else class="theme-toggle__button icon-placeholder" />
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped lang="scss">
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);

  &:hover {
    .vui-switch .vui-switch-icon .vui-switch-indicator {
      background-color: var(--color-text-light);
    }
  }

  &__switch {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
  }

  &__label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    color: var(--color-text);
  }

  // This is a super scuffed way of doing this but until VUI has a smaller switch we will be doing this.
  &--small {
    padding: 0;
    gap: 0;
    margin-top: -2px;
    margin-right: 4px;
    width: 32px;
    height: 1.5rem;

    .theme-toggle__label {
      font-size: var(--font-size-s);
      margin-right: -8px;
    }

    &:not(.theme-toggle--button) .theme-toggle__switch {
      transform: scale(0.5);
    }
  }

  .icon-placeholder {
    width: 1em;
    height: 1em;
  }
}
</style>
