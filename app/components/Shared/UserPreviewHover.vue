<script setup lang="ts">
import { Popout } from '@dolanske/vui'
import { ref, watch } from 'vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'

const props = withDefaults(defineProps<{
  userId?: string | null
  maxBadges?: number
  enterDelay?: number
  leaveDelay?: number
}>(), {
  userId: null,
  maxBadges: 3,
  enterDelay: 500,
  leaveDelay: 150,
})

const anchorRef = ref<HTMLElement | null>(null)
const visible = ref(false)

watch(() => props.userId, (newId) => {
  if (!newId)
    visible.value = false
})
</script>

<template>
  <div
    ref="anchorRef"
    class="user-preview-hover"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
    @focusin="visible = true"
    @focusout="visible = false"
  >
    <slot />

    <Popout
      :anchor="anchorRef" :visible="!!(visible && props.userId)" placement="bottom" :offset="16" :enter-delay="props.enterDelay" :leave-delay="props.leaveDelay" @mouseenter="visible = true"
      @mouseleave="visible = false"
    >
      <UserPreviewCard
        :user-id="props.userId"
        :max-badges="props.maxBadges"
      />
    </Popout>
  </div>
</template>

<style lang="scss">
.user-preview-hover {
  display: inline-block;
}
</style>
