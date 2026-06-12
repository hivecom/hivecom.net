<script setup lang="ts">
import type { StorageAsset } from '@/lib/storageAssets'
import { Button, Card, CopyClipboard, Flex, Grid, Modal, Tooltip } from '@dolanske/vui'
import { useEventListener } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { downloadAsset, formatBytes, FORUMS_BUCKET_ID, isImageAsset, isVideoAsset } from '@/lib/storageAssets'

const props = defineProps<{
  assets: StorageAsset[]
  /**
   * Number of columns in the grid. Defaults to auto-fill with 200px min.
   */
  columns?: number
  /**
   * Show delete button in the card overlay. Defaults to false.
   */
  canDelete?: boolean
  /**
   * Pass true when assets are from the forums bucket to show the uploader row
   * and enable the path-segment fallback for uploader ID.
   */
  isForumsBucket?: boolean
  /**
   * When provided, the path-segment fallback further constrains to only assets
   * whose path starts with this context ID (e.g. a discussion ID).
   */
  forumContextId?: string
  /**
   * When true, clicking the card opens the lightbox preview instead of emitting clickAsset.
   * Also hides the explicit preview button.
   */
  clickToPreview?: boolean
}>()

const emit = defineEmits<{
  clickAsset: [asset: StorageAsset]
  deleteAsset: [asset: StorageAsset]
}>()

const gridColumns = computed(() =>
  props.columns ? `repeat(${props.columns}, 1fr)` : 'repeat(auto-fill, minmax(200px, 1fr))',
)

// Track which image URLs have been preloaded so they fade in rather than pop
const loadedUrls = ref(new Set<string>())

function preloadImage(url: string) {
  if (!import.meta.client || loadedUrls.value.has(url))
    return
  const img = new Image()
  img.onload = () => {
    loadedUrls.value = new Set(loadedUrls.value).add(url)
  }
  img.src = url
}

watch(() => props.assets, (assets) => {
  for (const asset of assets) {
    if (isImageAsset(asset) && asset.publicUrl)
      preloadImage(asset.publicUrl)
  }
}, { immediate: true })

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function isPreviewable(asset: StorageAsset): boolean {
  return Boolean(asset.publicUrl) && (isImageAsset(asset) || isVideoAsset(asset))
}

const previewableAssets = computed(() => props.assets.filter(isPreviewable))
const lightboxIndex = ref(-1)
const lightboxAsset = computed(() => previewableAssets.value[lightboxIndex.value] ?? null)
const lightboxUrl = computed(() => lightboxAsset.value?.publicUrl ?? null)
const lightboxIsVideo = computed(() => lightboxAsset.value != null && isVideoAsset(lightboxAsset.value))
const lightboxIsOpen = computed(() => lightboxIndex.value !== -1)
const lightboxHasPrev = computed(() => lightboxIndex.value > 0)
const lightboxHasNext = computed(() => lightboxIndex.value < previewableAssets.value.length - 1)

type SlideDir = 'left' | 'right'
const slideDir = ref<SlideDir>('left')

function openLightbox(asset: StorageAsset) {
  const idx = previewableAssets.value.findIndex(a => a.path === asset.path)
  if (idx !== -1)
    lightboxIndex.value = idx
}

function closeLightbox() {
  lightboxIndex.value = -1
}

function lightboxPrev() {
  if (lightboxHasPrev.value) {
    slideDir.value = 'right'
    lightboxIndex.value--
  }
}

function lightboxNext() {
  if (lightboxHasNext.value) {
    slideDir.value = 'left'
    lightboxIndex.value++
  }
}

const lightboxWrap = useTemplateRef('lightboxWrap')
const zoomTarget = useTemplateRef('zoomTarget')
const { contentStyle, navStyle, reset: resetZoom } = useLightboxZoom(lightboxWrap, zoomTarget, {
  onNext: lightboxNext,
  onPrev: lightboxPrev,
  canNext: () => lightboxHasNext.value,
  canPrev: () => lightboxHasPrev.value,
})

// Reset zoom/pan whenever the previewed asset changes or the lightbox closes.
watch(lightboxIndex, resetZoom)

useEventListener('keydown', (event) => {
  if (!lightboxIsOpen.value)
    return
  if (event.key === 'Escape')
    closeLightbox()
  else if (event.key === 'ArrowLeft')
    lightboxPrev()
  else if (event.key === 'ArrowRight')
    lightboxNext()
})
// ──────────────────────────────────────────────────────────────────────────────

function handleCardClick(asset: StorageAsset) {
  if (props.clickToPreview && isImageAsset(asset) && asset.publicUrl) {
    openLightbox(asset)
    return
  }
  emit('clickAsset', asset)
}

function handleOpenClick(asset: StorageAsset) {
  if (asset.publicUrl)
    window.open(asset.publicUrl, '_blank', 'noopener')
}

function handleDownloadClick(asset: StorageAsset) {
  downloadAsset(asset.publicUrl, asset.name)
}

function getUploaderId(asset: StorageAsset): string | null {
  const fromMeta = (asset.metadata as Record<string, unknown> | null)?.uploadedBy
  if (typeof fromMeta === 'string' && fromMeta.length > 0 && fromMeta !== 'unknown' && fromMeta !== 'anonymous')
    return fromMeta

  // Fallback: forum bucket path structure - {contextId}/{userId}/{filename}
  if (asset.bucket_id === FORUMS_BUCKET_ID) {
    const segments = asset.path.split('/').filter(Boolean)
    // If a context ID is provided, only match assets under that context
    if (props.forumContextId) {
      if (segments.length >= 2 && segments[0] === props.forumContextId)
        return segments[1] ?? null
    }
    else if (segments.length >= 2) {
      return segments[1] ?? null
    }
  }

  return null
}
</script>

<template>
  <Grid
    expand
    :columns="gridColumns"
    gap="s"
  >
    <Card
      v-for="asset in assets"
      :key="asset.path"
      class="asset-grid-card"
      :padding="false"
      @click="handleCardClick(asset)"
    >
      <div class="asset-grid-preview" :class="{ 'is-folder': asset.type === 'folder' }">
        <template v-if="asset.type === 'folder'">
          <Icon name="ph:folder-simple" size="32" />
        </template>
        <template v-else-if="isImageAsset(asset) && asset.publicUrl">
          <img
            :src="asset.publicUrl"
            :alt="loadedUrls.has(asset.publicUrl!) ? asset.name : ''"
            loading="lazy"
            :class="{ 'is-loaded': loadedUrls.has(asset.publicUrl!) }"
          >
        </template>
        <template v-else-if="isVideoAsset(asset) && asset.publicUrl">
          <video :src="asset.publicUrl" autoplay loop muted playsinline preload="auto" class="asset-grid-video" />
        </template>
        <template v-else>
          <Icon name="ph:file" size="32" />
        </template>

        <div v-if="asset.type !== 'folder'" class="asset-grid-actions" @click.stop>
          <Tooltip v-if="!props.clickToPreview && isPreviewable(asset)">
            <Button size="s" variant="gray" square @click="openLightbox(asset)">
              <Icon name="ph:eye" size="16" />
            </Button>
            <template #tooltip>
              <p>Preview</p>
            </template>
          </Tooltip>
          <CopyClipboard :text="asset.path" confirm>
            <Tooltip>
              <Button size="s" square>
                <Icon name="ph:copy" />
              </Button>
              <template #tooltip>
                <p>Copy asset ID</p>
              </template>
            </Tooltip>
          </CopyClipboard>
          <CopyClipboard :text="asset.publicUrl || ''" confirm>
            <Tooltip>
              <Button size="s" variant="gray" square :disabled="!asset.publicUrl">
                <Icon name="ph:link-simple" />
              </Button>
              <template #tooltip>
                <p>Copy URL</p>
              </template>
            </Tooltip>
          </CopyClipboard>
          <Tooltip v-if="asset.publicUrl">
            <Button size="s" variant="gray" square @click="handleOpenClick(asset)" @auxclick.middle.prevent="handleOpenClick(asset)">
              <Icon name="ph:arrow-square-out" size="16" />
            </Button>
            <template #tooltip>
              <p>Open</p>
            </template>
          </Tooltip>
          <Tooltip v-if="asset.publicUrl">
            <Button size="s" variant="gray" square @click="handleDownloadClick(asset)">
              <Icon name="ph:download-simple" size="16" />
            </Button>
            <template #tooltip>
              <p>Download</p>
            </template>
          </Tooltip>
          <Button
            v-if="canDelete"
            variant="danger"
            size="s"
            square
            @click="emit('deleteAsset', asset)"
          >
            <Icon name="ph:trash" size="16" />
          </Button>
        </div>
      </div>

      <Flex column gap="xxs" class="asset-grid-details">
        <strong class="text-s w-90 mb-xs text-overflow-1">{{ asset.name }}</strong>
        <Flex y-center gap="s" x-start expand>
          <span v-if="asset.type !== 'folder' && asset.extension" class="text-xxs text-color-light">{{ asset.extension.toUpperCase() }}</span>
          <span class="text-xxs text-color-light">{{ asset.type === 'folder' ? 'Folder' : formatBytes(asset.size) }}</span>
          <UserLink :user-id="getUploaderId(asset)" placeholder="Unknown" class="text-xxs" />
        </Flex>
      </Flex>
    </Card>
  </Grid>

  <Modal class="md-lightbox" size="screen" :open="lightboxIsOpen" centered @close="closeLightbox">
    <div ref="lightboxWrap" class="md-lightbox__img-wrap">
      <Transition :name="`md-lightbox-slide-${slideDir}`">
        <div v-if="lightboxUrl" :key="lightboxUrl" class="md-lightbox__slide" :style="navStyle" @click.self="closeLightbox">
          <video v-if="lightboxIsVideo" ref="zoomTarget" class="ignored" :src="lightboxUrl" :style="contentStyle" controls autoplay loop playsinline preload="auto" />
          <img v-else ref="zoomTarget" class="ignored" :src="lightboxUrl" :style="contentStyle" :alt="lightboxAsset?.name ?? ''" loading="lazy" decoding="async">
        </div>
      </Transition>
    </div>
    <Flex v-if="previewableAssets.length > 1" x-center gap="l" class="md-lightbox-nav" y-center>
      <Button size="s" square :disabled="!lightboxHasPrev" :variant="lightboxHasPrev ? 'fill' : 'gray'" @click="lightboxPrev">
        <Icon name="ph:arrow-left" />
      </Button>
      <span>{{ lightboxIndex + 1 }} / {{ previewableAssets.length }}</span>
      <Button size="s" square :disabled="!lightboxHasNext" :variant="lightboxHasNext ? 'fill' : 'gray'" @click="lightboxNext">
        <Icon name="ph:arrow-right" />
      </Button>
    </Flex>
  </Modal>
</template>

<style scoped lang="scss">
.asset-grid-card {
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
  transition: border-color var(--transition);

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.asset-grid-details {
  padding: var(--space-m);
}

.asset-grid-preview {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: var(--border-radius-m);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  background: var(--color-bg-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  &.is-folder {
    color: var(--color-text-light);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-s);
    opacity: 0;
    transition: var(--transition-slow);

    &.is-loaded {
      opacity: 1;
    }
  }
}

.asset-grid-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-grid-actions {
  position: absolute;
  top: var(--space-xs);
  right: var(--space-xs);
  display: flex;
  gap: var(--space-xxs);
  opacity: 0;
  transition: opacity var(--transition);

  .vui-button:not(.vui-button-variant-danger) {
    border: 1px solid var(--color-border-strong);
  }

  .asset-grid-card:hover & {
    opacity: 1;
  }
}
</style>
