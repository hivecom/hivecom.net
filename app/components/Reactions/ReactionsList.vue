<script setup lang="ts">
import type { DisplayReaction } from '@/lib/reactions'
import { Flex, Popout } from '@dolanske/vui'
import { onBeforeUnmount, ref } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

const props = defineProps<{
  reactions: DisplayReaction[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: [emote: string, provider: string]
}>()

// ── Per-reaction popout state ─────────────────────────────────────────────────

interface ReactionPopoutState {
  anchor: HTMLElement | null
  visible: boolean
  showTimeout: ReturnType<typeof setTimeout> | null
  hideTimeout: ReturnType<typeof setTimeout> | null
}

const ENTER_DELAY = 400
const LEAVE_DELAY = 200

// Keyed by `provider:content`
const popoutStates = ref(new Map<string, ReactionPopoutState>())
// Anchor element refs keyed by `provider:content`
const anchorRefs = ref(new Map<string, HTMLElement | null>())

function getKey(reaction: DisplayReaction) {
  return `${reaction.provider}:${reaction.content}`
}

function getState(key: string): ReactionPopoutState {
  if (!popoutStates.value.has(key)) {
    popoutStates.value.set(key, {
      anchor: null,
      visible: false,
      showTimeout: null,
      hideTimeout: null,
    })
  }
  return popoutStates.value.get(key)!
}

function setAnchorRef(key: string, el: Element | ComponentPublicInstance | null) {
  anchorRefs.value.set(key, el instanceof HTMLElement ? el : null)
}

function handleEnter(key: string) {
  const state = getState(key)

  if (state.showTimeout) {
    clearTimeout(state.showTimeout)
    state.showTimeout = null
  }
  if (state.hideTimeout) {
    clearTimeout(state.hideTimeout)
    state.hideTimeout = null
  }

  if (state.visible)
    return

  state.showTimeout = setTimeout(() => {
    state.visible = true
    state.showTimeout = null
  }, ENTER_DELAY)
}

function handleLeave(key: string) {
  const state = getState(key)

  if (state.showTimeout) {
    clearTimeout(state.showTimeout)
    state.showTimeout = null
  }

  state.hideTimeout = setTimeout(() => {
    state.visible = false
    state.hideTimeout = null
  }, LEAVE_DELAY)
}

function isVisible(key: string): boolean {
  return popoutStates.value.get(key)?.visible ?? false
}

function getAnchor(key: string): HTMLElement | null {
  return anchorRefs.value.get(key) ?? null
}

onBeforeUnmount(() => {
  for (const state of popoutStates.value.values()) {
    if (state.showTimeout)
      clearTimeout(state.showTimeout)
    if (state.hideTimeout)
      clearTimeout(state.hideTimeout)
  }
})
</script>

<template>
  <div class="reactions__list">
    <div
      v-for="reaction in props.reactions"
      :key="getKey(reaction)"
      :ref="(el) => setAnchorRef(getKey(reaction), el)"
      class="reactions__button-wrapper"
      @mouseenter="handleEnter(getKey(reaction))"
      @mouseleave="handleLeave(getKey(reaction))"
    >
      <button
        class="reactions__button"
        :class="{ 'reactions__button--active': reaction.byMe }"
        :disabled="props.disabled"
        @click="emit('toggle', reaction.content, reaction.provider)"
      >
        {{ reaction.content }}
        <span class="reactions__counter">{{ reaction.count }}</span>
      </button>

      <Popout
        v-if="reaction.reactors.length > 0"
        :anchor="getAnchor(getKey(reaction))"
        :visible="isVisible(getKey(reaction))"
        placement="top"
        :offset="8"
        @mouseenter="handleEnter(getKey(reaction))"
        @mouseleave="handleLeave(getKey(reaction))"
      >
        <Flex wrap y-center gap="xs" class="reactions__popout">
          <UserAvatar
            v-for="userId in reaction.reactors"
            :key="userId"
            :user-id="userId"
            size="s"
            :show-preview="true"
            :linked="true"
          />
        </Flex>
      </Popout>
    </div>
  </div>
</template>

<style lang="scss">
.reactions__list {
  display: contents;
}

.reactions__button-wrapper {
  position: relative;
  display: inline-flex;
}

.reactions__popout {
  padding: var(--space-xs);
  max-width: 168px;
}
</style>
