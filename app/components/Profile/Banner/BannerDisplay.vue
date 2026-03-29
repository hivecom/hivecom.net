<script setup lang="ts">
import type { UserDisplayData } from '@/composables/useDataUser'
import { computed, ref, watch } from 'vue'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'

const props = defineProps<{
  /**
   * The display data for the post author. When null the component renders nothing.
   */
  user: UserDisplayData | null
}>()

const supabase = useSupabaseClient()

// Track whether the banner image failed to load (e.g. file deleted but
// has_banner flag not yet cleared). Reset when the user prop changes so a
// fresh image attempt is made for every new author rendered.
const bannerLoadFailed = ref(false)
watch(() => props.user?.id, () => {
  bannerLoadFailed.value = false
})

/**
 * Synchronous public URL — Supabase Storage getPublicUrl never hits the
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
const hasContent = computed(() => showBanner.value)

function onBannerError() {
  bannerLoadFailed.value = true
}
</script>

<template>
  <div v-if="hasContent" class="banner-display">
    <img
      v-if="showBanner"
      :src="bannerUrl!"
      :alt="`${user?.username ?? 'User'}'s forum banner`"
      class="banner-display__image"
      loading="lazy"
      decoding="async"
      @error="onBannerError"
    >
  </div>
</template>

<style lang="scss" scoped>
.banner-display {
  border-top: 1px solid var(--color-border-weak);
  padding-top: var(--space-xs);
  margin-top: var(--space-s);

  // Prevent the section from collapsing into zero-height while the browser
  // is fetching the image. We know banners are at most 48 px tall.
  min-height: 1px;

  &__image {
    display: block;
    // Scale down on narrow containers while never exceeding the banner's
    // native 48 px height on wide ones.
    width: 100%;
    height: auto;
    max-height: 48px;
    object-fit: fill;
    border-radius: var(--radius-xs, 2px);
  }
}
</style>
