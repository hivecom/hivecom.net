<script setup lang="ts">
import type { UserDisplayData } from '@/composables/useDataUser'
import { computed, ref, watch } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'

const props = defineProps<{
  user: UserDisplayData | null

  /** Drops the top padding for containers that bring their own spacing */
  flush?: boolean

  /** Lets the parent drive the reveal, e.g. while the reply row is hovered */
  externalHover?: boolean
}>()

const supabase = useSupabaseClient()
const { settings } = useDataUserSettings()

// Set when the image fails to load, e.g. the file is gone but has_banner isn't
// cleared yet. Reset per author so each one gets a fresh attempt.
const bannerLoadFailed = ref(false)
watch(() => props.user?.id, () => {
  bannerLoadFailed.value = false
})

const bannerExtension = computed(() => props.user?.banner_extension ?? 'webp')
const isVideoBanner = computed(() => bannerExtension.value === 'webm')

// getPublicUrl never hits the network, it only builds the URL, so this stays synchronous
const bannerUrl = computed<string | null>(() => {
  if (!props.user?.has_banner || !props.user.id)
    return null

  const ext = bannerExtension.value
  const { data } = supabase.storage
    .from(USERS_BUCKET_ID)
    .getPublicUrl(`${props.user.id}/banner.${ext}`)
  return data.publicUrl ?? null
})

const showBanner = computed(() => !!bannerUrl.value && !bannerLoadFailed.value)

const hasContent = computed(() => showBanner.value && settings.value.show_user_banners)

function onBannerError() {
  bannerLoadFailed.value = true
}

// ── Mobile tap-to-reveal ──────────────────────────────────────────────────────

const tapped = ref(false)
const hovered = ref(false)
const imgRef = ref<HTMLImageElement | null>(null)
const isActive = computed(() => hovered.value || tapped.value || !!props.externalHover)

// Reveal on touchend, and only if the finger barely moved, so a scroll that ends
// over the image doesn't count as a tap
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

  if (dx < 10 && dy < 10) {
    e.preventDefault()
    tapped.value = !tapped.value
  }
}

// Only attached to the document while tapped, so dim banners cost nothing
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
.banner-display {
  // Keep the section from collapsing to zero height while the image loads
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
    display: block;
    width: 100%;
    // Enforce the 728x36 ratio regardless of the image's intrinsic size.
    // object-fit: cover crops oversized banners cleanly.
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
      // Mobile banners are full-bleed and flush with the container top, so drop the radius
      border-radius: 0;
    }
  }
}
</style>
