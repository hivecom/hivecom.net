<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'

const props = withDefaults(defineProps<{
  label: string
  description?: string
  icon?: string
  variant?: BadgeVariant
  compact?: boolean
}>(), {
  description: '',
  variant: 'bronze',
  compact: false,
})

const badgeClasses = computed(() => {
  const classes = ['profile-badge', `profile-badge--${props.variant}`]
  if (props.compact)
    classes.push('profile-badge--compact')
  return classes
})
const ariaLabel = computed(() => props.description ? `${props.label} - ${props.description}` : props.label)

const labelClasses = computed(() => {
  const classes = ['profile-badge__label']
  if (props.variant === 'shiny')
    classes.push('shiny-text')
  if (props.variant === 'gold')
    classes.push('gold-text')
  return classes
})

const descriptionClasses = computed(() => {
  const classes = ['profile-badge__description']
  if (props.variant === 'shiny')
    classes.push('shiny-text')
  if (props.variant === 'gold')
    classes.push('gold-text')
  return classes
})

const badgeTextureConfig: Record<BadgeVariant, { base: string, reflection: string | null }> = {
  shiny: {
    base: '/badges/opal.png',
    reflection: '/badges/textures/reflection_opal.png',
  },
  gold: {
    base: '/badges/gold.png',
    reflection: '/badges/textures/reflection_metal.png',
  },
  silver: {
    base: '/badges/silver.png',
    reflection: '/badges/textures/reflection_metal.png',
  },
  bronze: {
    base: '/badges/copper.png',
    reflection: '/badges/textures/reflection_metal.png',
  },
}

const baseTextureSrc = computed(() => badgeTextureConfig[props.variant].base)
const reflectionTextureSrc = computed(() => badgeTextureConfig[props.variant].reflection)
const tooltipBindings = computed(() => props.description ? { placement: 'bottom' as const } : undefined)
</script>

<template>
  <component
    :is="props.description ? Tooltip : 'div'"
    class="profile-badge__tooltip-wrapper"
    v-bind="tooltipBindings"
  >
    <template v-if="props.description" #tooltip>
      <p :class="descriptionClasses">
        {{ props.description }}
      </p>
    </template>

    <article
      :class="badgeClasses"
      :aria-label="ariaLabel"
      role="figure"
    >
      <div class="profile-badge__hex-wrapper" aria-hidden="true">
        <div class="profile-badge__hex-stack">
          <img
            class="profile-badge__hex-image"
            :src="baseTextureSrc"
            alt=""
            decoding="async"
          >
          <img
            v-if="reflectionTextureSrc"
            class="profile-badge__hex-image profile-badge__hex-image--reflection"
            :src="reflectionTextureSrc"
            alt=""
            decoding="async"
          >
          <div class="profile-badge__hex-center">
            <slot name="hex">
              <div v-if="props.icon" class="profile-badge__icon profile-badge__icon--embossed">
                <Icon
                  :name="props.icon"
                  class="profile-badge__icon-layer profile-badge__icon-layer--glow"
                />
                <Icon
                  :name="props.icon"
                  class="profile-badge__icon-layer profile-badge__icon-layer--glyph"
                />
              </div>
              <div v-else class="profile-badge__icon profile-badge__icon--placeholder">
                <Icon name="ph:hexagon" />
              </div>
            </slot>
          </div>
        </div>
      </div>

      <svg
        class="profile-badge__icon-gradient-defs"
        aria-hidden="true"
        focusable="false"
        width="0"
        height="0"
      >
        <defs>
          <linearGradient id="profile-badge-icon-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#fefefe" stop-opacity="0.95" />
            <stop offset="40%" stop-color="#d0d2d9" stop-opacity="0.85" />
            <stop offset="70%" stop-color="#6d6f78" stop-opacity="0.95" />
            <stop offset="100%" stop-color="#050507" stop-opacity="0.98" />
          </linearGradient>
        </defs>
      </svg>

      <div v-if="!props.compact" class="profile-badge__body">
        <p :class="labelClasses">
          {{ props.label }}
        </p>
      </div>
    </article>
  </component>
</template>

<style scoped lang="scss">
.profile-badge {
  --badge-surface: linear-gradient(135deg, #161625 0%, #0f111c 100%);
  --badge-border: rgba(255, 255, 255, 0.08);
  --badge-glow: rgba(255, 255, 255, 0.08);
  --badge-icon-color: #fef6dd;

  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: clamp(1rem, 2vw, 1.75rem);
  padding: clamp(1.25rem, 4vw, 2.25rem);
  background: var(--badge-surface);
  border: 1px solid var(--badge-border);
  border-radius: 32px;
  box-shadow:
    0 15px 35px rgba(6, 6, 12, 0.65),
    0 0 45px var(--badge-glow);
}

.profile-badge__hex-wrapper {
  width: clamp(150px, 40vw, 260px);
  max-width: 100%;
  filter: drop-shadow(0 25px 35px rgba(0, 0, 0, 0.55));
}

.profile-badge__hex-stack {
  position: relative;
  width: 100%;
  line-height: 0;
}

.profile-badge__hex-image {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
}

.profile-badge__hex-image--reflection {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  mix-blend-mode: color-dodge;
  pointer-events: none;
}

.profile-badge__hex-center {
  position: absolute;
  inset: 0;
  padding: clamp(4px, 6%, 18px);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--badge-icon-color);
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.35),
    0 -2px 0 rgba(0, 0, 0, 0.55),
    0 6px 12px rgba(0, 0, 0, 0.55);
  font-weight: var(--font-weight-bold, 700);
  letter-spacing: 0.08em;
}

.profile-badge__hex-center :deep(*) {
  color: inherit;
  text-shadow: inherit;
}

.profile-badge__icon {
  position: relative;
  width: clamp(40px, 32%, 108px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--badge-icon-color);
}

.profile-badge__icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.profile-badge__icon-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-badge__icon-layer :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.profile-badge__icon-layer--glow {
  color: var(--badge-icon-color);
  opacity: 0.9;
  transform: scale(1.08);
  filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.65));
  z-index: 0;
}

.profile-badge__icon-layer--glyph {
  color: rgba(5, 5, 5, 0.85);
  z-index: 1;
  mix-blend-mode: multiply;
  filter: drop-shadow(0 -1px 1px rgba(255, 255, 255, 0.35));
}

.profile-badge__icon-layer--glyph :deep(svg) {
  fill: url('#profile-badge-icon-gradient');
  stroke: url('#profile-badge-icon-gradient');
}

.profile-badge__icon-gradient-defs {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}

.profile-badge__icon--placeholder {
  opacity: 0.45;
  width: clamp(36px, 28%, 90px);
}

.profile-badge__body {
  position: relative;
  z-index: 1;
  max-width: 360px;
}

.profile-badge__label {
  font-size: clamp(1rem, 2vw, 2rem);
  font-weight: var(--font-weight-bold, 700);
  margin: 0 0 0.25rem 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--badge-icon-color);
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25),
    0 -2px 0 rgba(0, 0, 0, 0.55),
    0 8px 16px rgba(0, 0, 0, 0.55);
  display: block;
}

.profile-badge__tooltip-wrapper {
  display: block;
}

.profile-badge__description {
  margin: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.95rem;
  line-height: 1.5;
  max-width: 260px;
}

.profile-badge__label.shiny-text,
.profile-badge__label.gold-text,
.profile-badge__description.shiny-text,
.profile-badge__description.gold-text {
  display: block;
}

.profile-badge--shiny {
  --badge-surface: linear-gradient(135deg, #2a1d48, #100c1a);
  --badge-border: rgba(186, 143, 255, 0.65);
  --badge-glow: rgba(186, 143, 255, 0.35);
  --badge-icon-color: #f6edff;
  border: 1px solid transparent;
  background-image: var(--badge-surface), var(--shiny-gradient);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  background-repeat: no-repeat;
}

.profile-badge--gold {
  --badge-surface: linear-gradient(135deg, #2b1f0f, #0b0702);
  --badge-border: rgba(255, 196, 94, 0.65);
  --badge-glow: rgba(255, 196, 94, 0.35);
  --badge-icon-color: #ffe9b6;
  border: 1px solid transparent;
  background-image:
    var(--badge-surface),
    linear-gradient(125deg, #fdf4d4 0%, #ffe9a8 18%, #f2c15a 42%, #c88a2a 65%, #f2c15a 82%, #fdf4d4 100%);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  background-repeat: no-repeat;
}

.profile-badge--silver {
  --badge-surface: linear-gradient(135deg, #1c2332, #090c12);
  --badge-border: rgba(196, 220, 255, 0.55);
  --badge-glow: rgba(196, 220, 255, 0.25);
  --badge-icon-color: #f0f4ff;
}

.profile-badge--bronze {
  --badge-surface: linear-gradient(135deg, #27150d, #0b0503);
  --badge-border: rgba(255, 181, 138, 0.45);
  --badge-glow: rgba(255, 181, 138, 0.2);
  --badge-icon-color: #ffdec8;
}

.profile-badge.profile-badge--compact {
  padding: 0;
  border: none;
  background: none;
  background-image: none;
  box-shadow: none;
  gap: var(--space-xs);
}

.profile-badge--compact .profile-badge__body {
  display: none;
}

.profile-badge--compact .profile-badge__hex-wrapper {
  width: clamp(90px, 26vw, 100%);
}

@media (max-width: 640px) {
  .profile-badge__label {
    letter-spacing: 0.12em;
  }
}
</style>
