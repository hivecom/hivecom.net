<script setup lang="ts">
import { Button, Drawer, Popout } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useBreakpoint } from '@/lib/mediaQuery'

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
// Only activate the useDataUser fetch after first hover - this prevents
// N individual profile queries racing against the useBulkDataUser batch load.
// Once hovered, the bulk cache is warm and useDataUser will hit it instantly.
const everHovered = ref(false)

watch(() => props.userId, (newId) => {
  if (!newId) {
    visible.value = false
    everHovered.value = false
  }
})

// Supply the ID lazily - resolves to null until the first hover event, at
// which point useBulkDataUser will have already populated the shared cache.
const lazyUserId = computed(() => everHovered.value ? (props.userId ?? null) : null)

const { user } = useDataUser(lazyUserId, {
  includeAvatar: false,
  includeRole: false,
})

// Only open the popout when we actually have profile data to show.
// This prevents an empty card from appearing for non-public profiles
// when the visitor is unauthenticated (RLS returns nothing for them).
const canShowPopout = computed(() => !!(visible.value && props.userId && user.value))

const isMobile = useBreakpoint('<s')
const currentUser = useSupabaseUser()

function handleMobileClick(e: Event) {
  if (!currentUser.value)
    return

  e.stopImmediatePropagation()
  visible.value = !visible.value
}
</script>

<template>
  <div
    v-if="isMobile"
    role="button"
    class="user-preview-mobile"
    @click="handleMobileClick"
  >
    <slot />

    <Drawer :open="visible" @close="visible = false">
      <div class="user-preview-mobile__wrapper">
        <UserPreviewCard
          :user-id="props.userId"
          :max-badges="props.maxBadges"
        />

        <div class="px-m">
          <NuxtLink :to="`/profile/${user?.username ?? props.userId}`">
            <Button expand outline>
              View profile
            </Button>
          </NuxtLink>
        </div>
      </div>
    </Drawer>
  </div>

  <div
    v-else
    ref="anchorRef"
    class="user-preview-hover"
    @mouseenter="everHovered = true; visible = true"
    @mouseleave="visible = false"
    @focusin="everHovered = true; visible = true"
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
  display: inline-flex;
}

.user-preview-mobile {
  display: inline-flex;
  // Nested slot content links should not work on mobile and open drawer.
  // Here we select the very first link or the links inside the very first element (slot)
  & > * > a,
  & > a {
    pointer-events: none;
    user-select: none;
  }

  &__wrapper {
    min-height: 292px;
    display: block;
    width: 100%;

    .user-preview-card {
      width: 100%;
    }
  }
}
</style>
