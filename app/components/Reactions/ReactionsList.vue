<script setup lang="ts">
import type { DisplayReaction } from '@/lib/reactions'
import { Flex, Popout } from '@dolanske/vui'
import { ref } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

const props = defineProps<{
  reactions: DisplayReaction[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: [emote: string, provider: string]
}>()

const anchorRefs = ref(new Map<string, HTMLElement | null>())
const visibleMap = ref(new Map<string, boolean>())

function getKey(reaction: DisplayReaction) {
  return `${reaction.provider}:${reaction.content}`
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
