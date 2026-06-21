<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { getUserActivityStatus } from '@/lib/lastSeen'

// Presence combines IRC membership with website activity. The dot encodes:
//   'online'  - a Hivecom account active on the site (solid green)
//   'irc'     - in this channel via IRC, not active on the site (hollow green)
//   'away'    - in this channel but marked away on IRC (gray)
//   'offline' - not in the channel and not active on the site (gray)
const props = withDefaults(defineProps<{
  /** Whether the user is currently a member of the IRC channel. */
  onIrc?: boolean
  /** IRC away flag (only meaningful when onIrc). */
  away?: boolean
  /** Resolved Hivecom account's last website activity (ISO string), if any. */
  lastSeen?: string | null
  /** Suppress the tooltip (e.g. on touch devices). */
  noTooltip?: boolean
  /** Dot diameter in px. */
  size?: number
}>(), {
  onIrc: true,
  size: 7,
})

type Presence = 'online' | 'irc' | 'away' | 'offline'

const activity = computed(() =>
  props.lastSeen ? getUserActivityStatus(props.lastSeen) : null,
)

const state = computed<Presence>(() => {
  if (props.onIrc && props.away)
    return 'away'
  if (activity.value?.isActive)
    return 'online'
  if (props.onIrc)
    return 'irc'
  return 'offline'
})

const label = computed(() => {
  switch (state.value) {
    case 'online':
      return 'Online'
    case 'irc':
      return 'Connected via IRC only'
    case 'away':
      return 'Offline'
    default:
      return activity.value?.lastSeenText ?? 'Offline'
  }
})
</script>

<template>
  <span class="chat-presence" :style="{ '--dot-size': `${size}px` }">
    <Tooltip :disabled="noTooltip" placement="top">
      <span class="chat-presence__dot" :class="`chat-presence__dot--${state}`" />
      <template #tooltip>
        {{ label }}
      </template>
    </Tooltip>
  </span>
</template>

<style lang="scss" scoped>
.chat-presence {
  position: absolute;
  right: -1px;
  bottom: -1px;
  line-height: 0;

  &__dot {
    display: block;
    width: var(--dot-size);
    height: var(--dot-size);
    border-radius: var(--border-radius-pill);
    // Ring in the surface colour separates the dot from the avatar behind it.
    box-shadow: 0 0 0 1.5px var(--color-bg);

    &--online {
      background: var(--color-text-green);
    }

    &--away,
    &--offline {
      background: var(--color-text-lighter);
    }

    // Online on IRC but not active on the site: hollow ring, no fill.
    &--irc {
      background: var(--color-bg);
      box-shadow:
        inset 0 0 0 1.5px var(--color-text-green),
        0 0 0 1.5px var(--color-bg);
    }
  }
}
</style>
