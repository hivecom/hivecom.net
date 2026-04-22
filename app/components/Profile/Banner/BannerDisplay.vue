<script setup lang="ts">
import type { UserDisplayData } from '@/composables/useDataUser'
import { computed, ref, watch } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'

const props = defineProps<{
  /**
   * The display data for the post author. When null the component renders nothing.
   */
  user: UserDisplayData | null
  /**
   * When true, suppresses the default top padding so the banner sits flush
   * inside a container that already provides its own spacing (e.g. mobile footer).
   */
  flush?: boolean
}>()

const supabase = useSupabaseClient()
const { settings } = useDataUserSettings()

// Track whether the banner image failed to load (e.g. file deleted but
// has_banner flag not yet cleared). Reset when the user prop changes so a
// fresh image attempt is made for every new author rendered.
const bannerLoadFailed = ref(false)
watch(() => props.user?.id, () => {
  bannerLoadFailed.value = false
})

/**
 * Synchronous public URL - Supabase Storage getPublicUrl never hits the
 * network, it just constructs the URL from the project's storage endpoint.
 */
const bannerUrl = computed<string | null>(() => {
  if (!props.user?.has_banner || !props.user.id)
    return null
  const { data } = supabase.storage
    .from(USERS_BUCKET_ID)
    .getPublicUrl(`${props.user.id}/banner.webp`)
  return data.publicUrl ?? null
})

/** Whether the banner image is currently intended to be shown. */
const showBanner = computed(() => !!bannerUrl.value && !bannerLoadFailed.value)

/** Whether this component has anything visible to render at all. */
const hasContent = computed(() => showBanner.value && settings.value.show_user_banners)

function onBannerError() {
  bannerLoadFailed.value = true
}

// ── Mobile tap-to-reveal ──────────────────────────────────────────────────────

const tapped = ref(false)
const hovered = ref(false)
const imgRef = ref<HTMLImageElement | null>(null)

/**
 * Toggle reveal on tap. We listen on touchend so that a scroll gesture that
 * happens to end over the image does not trigger a reveal - we check that no
 * significant movement occurred by comparing touch start/end positions.
 */
const touchStartX = ref(0)
const touchStartY = ref(0)

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  if (!t)
    return
  touchStartX.value = t.clientX
  touchStartY.value = t.clientY
}

function onTouchEnd(e: TouchEvent) {
  const t = e.changedTouches[0]
  if (!t)
    return
  const dx = Math.abs(t.clientX - touchStartX.value)
  const dy = Math.abs(t.clientY - touchStartY.value)
  // Only treat as a tap if the finger barely moved (not a scroll)
  if (dx < 10 && dy < 10) {
    e.preventDefault()
    tapped.value = !tapped.value
  }
}

/**
 * Reset the tapped state when the user touches anywhere outside the banner.
 * Attached to the document while tapped is true so we don't pay the cost
 * when banners are in their default dim state.
 */
function onOutsideTouch(e: TouchEvent) {
  if (imgRef.value && !imgRef.value.contains(e.target as Node)) {
    tapped.value = false
  }
}

watch(tapped, (val) => {
  if (val) {
    document.addEventListener('touchstart', onOutsideTouch, { passive: true })
  }
  else {
    document.removeEventListener('touchstart', onOutsideTouch)
  }
})
</script>

<template>
  <div
    v-if="hasContent"
    class="banner-display"
    :class="{ 'banner-display--flush': flush }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <img
      v-if="showBanner"
      ref="imgRef"
      :src="bannerUrl!"
      :alt="`${user?.username ?? 'User'}'s forum banner`"
      class="banner-display__image"
      :style="{
        filter: (hovered || tapped) ? 'saturate(1)' : 'saturate(0)',
        opacity: (hovered || tapped) ? '1' : '0.2',
      }"
      loading="lazy"
      decoding="async"
      @error="onBannerError"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    >
  </div>
</template>

<style lang="scss" scoped>
.banner-display {
  // Prevent the section from collapsing into zero-height while the browser
  // is fetching the image. Banners are exactly 728x36 px.
  min-height: 1px;
  padding-top: var(--space-s);

  &--flush {
    margin-top: 0;
    padding-top: 0;
  }

  &__image {
    display: block;
    // Enforce the canonical 728x36 aspect ratio and scale down on narrow
    // viewports. The image never exceeds its native width, and height is
    // derived from the ratio so nothing gets squished or stretched.
    width: 100%;
    aspect-ratio: 728 / 36;
    min-height: 36px;
    max-height: 36px;
    height: auto;
    object-fit: cover;
    border-radius: var(--border-radius-s);
    // filter and opacity are driven by inline :style bindings so hover/tap
    // state is handled in JS, avoiding scoped-CSS descendant selector quirks.
    transition:
      filter 0.25s cubic-bezier(0.65, 0, 0.35, 1),
      opacity 0.25s cubic-bezier(0.65, 0, 0.35, 1);
  }
}
</style>
