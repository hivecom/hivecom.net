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
  /**
   * When true, treats the banner as hovered from an external source (e.g. the
   * parent reply row is hovered). This allows the parent to drive the reveal
   * without the user needing to hover directly over the banner.
   */
  externalHover?: boolean
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
const bannerExtension = computed(() => props.user?.banner_extension ?? 'webp')
const isVideoBanner = computed(() => bannerExtension.value === 'webm')

const bannerUrl = computed<string | null>(() => {
  if (!props.user?.has_banner || !props.user.id)
    return null
  const ext = bannerExtension.value
  const { data } = supabase.storage
    .from(USERS_BUCKET_ID)
    .getPublicUrl(`${props.user.id}/banner.${ext}`)
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
const isActive = computed(() => hovered.value || tapped.value || !!props.externalHover)

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
    <video
      v-if="showBanner && isVideoBanner"
      ref="imgRef"
      :src="bannerUrl!"
      class="banner-display__image banner-display__image--video"
      :style="{
        filter: isActive ? 'saturate(1)' : 'saturate(0)',
        opacity: isActive ? '1' : '0.2',
      }"
      autoplay
      loop
      muted
      playsinline
      @error="onBannerError"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
    />
    <img
      v-else-if="showBanner"
      ref="imgRef"
      :src="bannerUrl!"
      :alt="`${user?.username ?? 'User'}'s forum banner`"
      class="banner-display__image"
      :style="{
        filter: isActive ? 'saturate(1)' : 'saturate(0)',
        opacity: isActive ? '1' : '0.2',
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
@use '@/assets/breakpoints.scss' as *;

.banner-display {
  // Prevent the section from collapsing into zero-height while the browser
  // is fetching the image. Banners are exactly 728x36 px.
  min-height: 1px;

  @media screen and (min-width: $breakpoint-s) {
    padding-top: var(--space-s);
  }

  &--flush {
    margin-top: 0;
    padding-top: 0;
  }

  &__image {
    display: block;
    // Enforce the canonical 728x36 aspect ratio and scale down on narrow
    // viewports. The image never exceeds its native width, and height is
    // derived from the ratio so nothing gets squished or stretched.
    display: block;
    width: 100%;
    // Enforce canonical 728x36 ratio regardless of the image's intrinsic
    // dimensions. object-fit: cover crops oversized banners cleanly.
    aspect-ratio: 728 / 36;
    max-height: 36px;
    object-fit: cover;
    border-radius: var(--border-radius-s);
    // filter and opacity are driven by inline :style bindings so hover/tap
    // state is handled in JS, avoiding scoped-CSS descendant selector quirks.
    transition:
      filter 0.25s cubic-bezier(0.65, 0, 0.35, 1),
      opacity 0.25s cubic-bezier(0.65, 0, 0.35, 1);

    &--video {
      // <video> also needs explicit object-fit; aspect-ratio handles height.
      object-fit: cover;
    }

    @media screen and (max-width: $breakpoint-s) {
      // On mobile, banners are full-bleed and flush with the top of the
      // container (e.g. the mobile footer) so we can use the full width of
      // the screen and save space by removing the border radius.
      border-radius: 0;
    }
  }
}
</style>
