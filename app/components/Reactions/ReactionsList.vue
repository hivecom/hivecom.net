<script setup lang="ts">
import type { DisplayReaction } from '@/lib/reactions'
import { Drawer, Flex, Popout } from '@dolanske/vui'
import { ref } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  reactions: DisplayReaction[]
  capped?: ReadonlySet<string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: [emote: string, provider: string]
}>()

const isMobile = useBreakpoint('<s')

// --- Desktop hover popout ---
const anchorRefs = ref(new Map<string, HTMLElement | null>())
const visibleMap = ref(new Map<string, boolean>())

function getKey(reaction: DisplayReaction) {
  return `${reaction.provider}:${reaction.content}`
}

function isCapped(reaction: DisplayReaction): boolean {
  return props.capped?.has(getKey(reaction)) ?? false
}

function setAnchorRef(key: string, el: Element | ComponentPublicInstance | null) {
  anchorRefs.value.set(key, el instanceof HTMLElement ? el : null)
}

function handleEnter(key: string) {
  visibleMap.value.set(key, true)
}

function handleLeave(key: string) {
  visibleMap.value.set(key, false)
}

function isVisible(key: string): boolean {
  return visibleMap.value.get(key) ?? false
}

function getAnchor(key: string): HTMLElement | null {
  return anchorRefs.value.get(key) ?? null
}

// --- Mobile long-press drawer ---
const LONG_PRESS_DURATION = 500

const drawerOpen = ref(false)
const drawerReaction = ref<DisplayReaction | null>(null)
const longPressTimers = ref(new Map<string, ReturnType<typeof setTimeout>>())
// Tracks whether a long press was consumed so the click handler can bail out
const longPressConsumed = ref(new Map<string, boolean>())

function onPointerDown(reaction: DisplayReaction, event: PointerEvent) {
  if (!isMobile.value)
    return

  const key = getKey(reaction)
  longPressConsumed.value.set(key, false)

  const timer = setTimeout(() => {
    if (reaction.reactors.length === 0)
      return
    longPressConsumed.value.set(key, true)
    drawerReaction.value = reaction
    drawerOpen.value = true
  }, LONG_PRESS_DURATION)

  longPressTimers.value.set(key, timer)

  // Prevent text selection on long press
  event.preventDefault()
}

function cancelLongPress(reaction: DisplayReaction) {
  const key = getKey(reaction)
  const timer = longPressTimers.value.get(key)
  if (timer != null) {
    clearTimeout(timer)
    longPressTimers.value.delete(key)
  }
}

function onPointerUp(reaction: DisplayReaction) {
  cancelLongPress(reaction)
}

function onPointerCancel(reaction: DisplayReaction) {
  cancelLongPress(reaction)
}

function handleClick(reaction: DisplayReaction) {
  const key = getKey(reaction)
  if (longPressConsumed.value.get(key)) {
    longPressConsumed.value.set(key, false)
    return
  }
  emit('toggle', reaction.content, reaction.provider)
}

function closeDrawer() {
  drawerOpen.value = false
}
</script>

<template>
  <div class="reactions__list">
    <div
      v-for="reaction in props.reactions"
      :key="getKey(reaction)"
      :ref="(el) => setAnchorRef(getKey(reaction), el)"
      class="reactions__button-wrapper"
      @mouseenter="!isMobile && handleEnter(getKey(reaction))"
      @mouseleave="!isMobile && handleLeave(getKey(reaction))"
    >
      <button
        class="reactions__button"
        :class="{
          'reactions__button--active': reaction.byMe,
          'reactions__button--capped': isCapped(reaction) && !reaction.byMe,
        }"
        :disabled="props.disabled || (isCapped(reaction) && !reaction.byMe)"
        @pointerdown="onPointerDown(reaction, $event)"
        @pointerup="onPointerUp(reaction)"
        @pointercancel="onPointerCancel(reaction)"
        @click="handleClick(reaction)"
      >
        {{ reaction.content }}
        <span class="reactions__counter">{{ isCapped(reaction) ? 'MAX' : reaction.count }}</span>
      </button>

      <!-- Desktop: hover popout -->
      <Popout
        v-if="!isMobile && reaction.reactors.length > 0"
        :anchor="getAnchor(getKey(reaction))"
        :visible="isVisible(getKey(reaction))"
        placement="top"
        :offset="8"
        :enter-delay="400"
        :leave-delay="200"
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

  <!-- Mobile: long-press drawer -->
  <Drawer
    v-if="isMobile"
    :open="drawerOpen"
    handle
    @close="closeDrawer"
  >
    <Flex column gap="s" class="reactions__drawer">
      <p class="reactions__drawer-emote">
        {{ drawerReaction?.content }}
      </p>
      <p class="reactions__drawer-label">
        Reacted by
      </p>
      <Flex wrap gap="s" class="reactions__drawer-avatars">
        <UserAvatar
          v-for="userId in drawerReaction?.reactors ?? []"
          :key="userId"
          :user-id="userId"
          size="m"
          :show-preview="false"
          :linked="true"
        />
      </Flex>
    </Flex>
  </Drawer>
</template>

<style scoped lang="scss">
.reactions__list {
  user-select: none;
}

.reactions__drawer {
  padding: var(--space-m) var(--space-m) var(--space-xl);

  &-emote {
    font-size: var(--font-size-xxxxl);
    line-height: 1;
    margin: 0;
  }

  &-label {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    margin: 0;
  }

  &-avatars {
    padding-bottom: var(--space-s);
  }
}
</style>
