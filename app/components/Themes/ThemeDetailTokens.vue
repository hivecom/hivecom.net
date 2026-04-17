<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex, Grid } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { dbToPercent, SCALE_CONFIGS, scaleToken, scaleTransition } from '@/lib/theme'

const { data } = defineProps<{ data: Tables<'themes'> }>()

// Maps a container token's default pixel value to a display percentage (20-70%),
// then applies the widening scale multiplier and clamps to 100%.
function containerToDisplayPercent(defaultValue: number, wideningDb: number): number {
  const LOWER_PERCENT = 20
  const UPPER_PERCENT = 70

  const tokens = SCALE_CONFIGS.widening.tokens
  const minDefault = tokens.at(0)?.defaultValue ?? 0
  const maxDefault = tokens.at(-1)?.defaultValue ?? 1
  const basePercent = LOWER_PERCENT + ((defaultValue - minDefault) / (maxDefault - minDefault)) * (UPPER_PERCENT - LOWER_PERCENT)
  const multiplier = dbToPercent(wideningDb, 'widening') / 100
  return Math.min(Math.round(basePercent * multiplier), 100)
}

const isMobile = useBreakpoint('<s')
</script>

<template>
  <Grid :columns="isMobile ? 1 : 2" gap="xxl">
    <!-- Widening -->
    <Flex column gap="s" expand>
      <span>Containers</span>
      <Flex v-for="token in SCALE_CONFIGS.widening.tokens" :key="token.varName" y-center gap="l" x-start expand>
        <div class="container-track">
          <div class="container-scale" :style="{ width: `${containerToDisplayPercent(token.defaultValue, data.widening)}%` }" />
        </div>
        <span class="token-label exact">
          {{ `${scaleToken(token.defaultValue, data.widening, 'widening')}px` }}
        </span>
        <span class="token-label exact">
          {{ token.varName.replace('--container-', '') }}
        </span>
      </Flex>
    </Flex>

    <!-- Rounding -->
    <Flex column gap="s" expand>
      <span>Rounding</span>
      <Flex v-for="token in SCALE_CONFIGS.rounding.tokens" :key="token.varName" y-center gap="l" x-start expand>
        <div
          class="rounding-cube"
          :style="{ borderTopLeftRadius: `${scaleToken(token.defaultValue, data.rounding, 'rounding')}px` }"
        />
        <span class="token-label exact">
          {{ token.varName.replace('--border-radius-', '') }}
        </span>
        <span class="token-label exact">
          {{ `${scaleToken(token.defaultValue, data.rounding, 'rounding')}px` }}
        </span>
      </Flex>
    </Flex>

    <!-- Spacing -->
    <Flex column gap="s" expand>
      <span>Spacing</span>
      <Flex v-for="token in SCALE_CONFIGS.spacing.tokens" :key="token.varName" y-center gap="l" x-start expand>
        <div
          class="spacing-bar"
          :style="{ minWidth: `${scaleToken(token.defaultValue, data.spacing, 'spacing')}px` }"
        />
        <span class="token-label exact">
          {{ `${scaleToken(token.defaultValue, data.spacing, 'spacing')}px` }}
        </span>
        <span class="token-label exact">
          {{ token.varName.replace('--space-', '') }}
        </span>
      </Flex>
    </Flex>

    <!-- Transitions -->
    <Flex column gap="s" expand>
      <span>Transitions</span>
      <Flex v-for="token in SCALE_CONFIGS.transitions.tokens" :key="token.varName" y-center gap="l" x-start expand>
        <div
          class="transition-box"
          :style="{ transition: scaleTransition(token, data.transitions) }"
        />
        <span class="token-label exact">
          {{ `${scaleTransition(token, data.transitions).split(' ')[0]}` }}
        </span>
        <span class="token-label exact">
          {{ token.varName.replace('--transition', '').replace('-', '') || 'normal' }}
        </span>
      </Flex>
    </Flex>
  </Grid>
</template>

<style lang="scss" scoped>
.token-label {
  font-size: var(--font-size-m);
  color: var(--color-text-lighter);

  &.exact {
    color: var(--color-text-lighter);
    min-width: 32px;

    &:first-of-type {
      color: var(--color-text);
    }
  }
}

.rounding-cube {
  display: block;
  width: 32px;
  height: 32px;
  border-radius: 0;
  border-top: 1px solid var(--color-accent);
  border-left: 1px solid var(--color-accent);
}

// Shared mixin for the line-with-tick-marks style
%tick-line {
  position: relative;
  height: 1px;
  background-color: var(--color-accent);
  margin-block: 15.5px;
  max-width: 156px;

  &:before,
  &:after {
    content: '';
    top: 50%;
    transform: translateY(-50%);
    position: absolute;
    left: 0;
    width: 1px;
    height: 8px;
    background-color: var(--color-accent);
  }

  &:after {
    left: 100%;
  }
}

.container-scale {
  @extend %tick-line;
  margin: auto;
}

.container-track {
  width: 128px;
  position: relative;
  height: 1px;
  border-bottom: 1px dashed var(--color-border-strong);
  margin-block: 15.5px;
  background-color: transparent;

  &:before,
  &:after {
    content: '';
    top: 50%;
    transform: translateY(-50%);
    position: absolute;
    left: 0;
    width: 1px;
    height: 8px;
    z-index: 1;
    background-color: var(--color-border-strong);
  }

  &:after {
    left: 100%;
  }

  & > div {
    z-index: 2;
  }
}

.spacing-bar {
  @extend %tick-line;
}

.transition-box {
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-s);
  background-color: var(--color-text-lightest);

  &:hover {
    background-color: var(--color-accent);
  }
}
</style>
