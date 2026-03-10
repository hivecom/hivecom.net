<script setup lang="ts">
import { Popout } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

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

const { user } = useCacheUserData(computed(() => props.userId ?? null), {
  includeAvatar: false,
  includeRole: false,
})

// Only open the popout when we actually have profile data to show.
// This prevents an empty card from appearing for non-public profiles
// when the visitor is unauthenticated (RLS returns nothing for them).
const canShowPopout = computed(() => !!(visible.value && props.userId && user.value))
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
      :anchor="anchorRef" :visible="canShowPopout" placement="bottom" :offset="16" :enter-delay="props.enterDelay" :leave-delay="props.leaveDelay" @mouseenter="visible = true"
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
