<script setup lang="ts">
import type { StorageAsset } from '@/lib/storageAssets'
import { Button, Card, CopyClipboard, Flex, Grid, Input, Sheet, Spinner } from '@dolanske/vui'

import { computed, ref, watch } from 'vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import MarkdownLightbox from '@/components/Shared/MarkdownLightbox.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatBytes, isImageAsset, isTextAsset, isVideoAsset } from '@/lib/storageAssets'

const props = defineProps<{
  asset: StorageAsset | null
}>()

const emit = defineEmits<{
  delete: [asset: StorageAsset]
  rename: [asset: StorageAsset]
}>()

const { canDeleteAssets } = useAdminPermissions()
const canDelete = computed(() => canDeleteAssets.value)
const canRename = computed(() => canDeleteAssets.value)

const isOpen = defineModel<boolean>('isOpen', { default: false })

const isText = computed(() => props.asset != null && isTextAsset(props.asset))
const hasPreview = computed(() => props.asset != null && props.asset.type === 'file' && (isImageAsset(props.asset) || isVideoAsset(props.asset) || isText.value))

const textContent = ref<string | null>(null)
const textLoading = ref(false)

watch(() => props.asset, async (asset) => {
  textContent.value = null
  if (!asset || !isText.value || !asset.publicUrl)
    return
  textLoading.value = true
  try {
    const res = await fetch(asset.publicUrl)
    textContent.value = await res.text()
  }
  catch {
    textContent.value = null
  }
  finally {
    textLoading.value = false
  }
}, { immediate: true })

const previewContainer = ref<HTMLElement | null>(null)
const isVideo = computed(() => props.asset != null && isVideoAsset(props.asset))
const assetUrl = computed(() => props.asset?.publicUrl ?? '')
const lightboxMarkdown = computed(() => assetUrl.value && !isVideo.value && !isText.value ? `![${props.asset?.name ?? 'asset'}](${assetUrl.value})` : '')
const markdownSnippet = computed(() => assetUrl.value ? `![${props.asset?.name ?? 'asset'}](${assetUrl.value})` : '')

const isMobile = useBreakpoint('<xs')
const showActionLabels = computed(() => !isMobile.value)
// const actionButtonSize = computed(() => showActionLabels.value ? 'm' as const : 's' as const)

function closeDrawer() {
  isOpen.value = false
}

function openInNewTab() {
  if (assetUrl.value)
    window.open(assetUrl.value, '_blank', 'noopener')
}

function requestDelete() {
  if (!props.asset)
    return
  emit('delete', props.asset)
}

function requestRename() {
  if (!props.asset)
    return
  emit('rename', props.asset)
}
</script>

<template>
  <Sheet
    :open="!!props.asset && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="560"
    @close="closeDrawer"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0" class="asset-details-header">
          <h4>Asset Details</h4>
          <p v-if="props.asset?.publicUrl" class="text-xs text-color-light">
            <NuxtLink :to="props.asset.publicUrl" target="_blank" rel="noopener">
              {{ props.asset.name }}
            </NuxtLink>
          </p>
          <p v-else class="text-xs text-color-light">
            {{ props.asset?.name }}
          </p>
        </Flex>
        <Flex gap="xs" y-center>
          <Button
            v-if="canRename"
            variant="gray"
            :square="!showActionLabels"
            @click="requestRename"
          >
            <template v-if="showActionLabels" #start>
              <Icon name="ph:text-t" />
            </template>
            <Icon v-if="!showActionLabels" name="ph:text-t" />
            <template v-if="showActionLabels">
              Rename
            </template>
          </Button>
          <Button
            v-if="canDelete"
            variant="danger"
            :square="!showActionLabels"
            @click="requestDelete"
          >
            <template v-if="showActionLabels" #start>
              <Icon name="ph:trash" />
            </template>
            <Icon v-if="!showActionLabels" name="ph:trash" />
            <template v-if="showActionLabels">
              Delete
            </template>
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.asset" column gap="l" class="asset-details">
      <Flex v-if="hasPreview" ref="previewContainer" expand class="asset-details__preview">
        <video v-if="isVideo" :src="assetUrl" controls class="asset-details__video" />
        <template v-else-if="isText">
          <Flex expand>
            <div v-if="textLoading" class="asset-details__text-preview asset-details__text-preview--loading">
              <Spinner />
            </div>
            <pre v-else-if="textContent !== null" class="asset-details__text-preview"><code>{{ textContent }}</code></pre>
            <div v-else class="asset-details__text-preview asset-details__text-preview--error">
              <span class="text-color-light">Could not load preview.</span>
            </div>
          </Flex>
        </template>
        <img v-else :src="assetUrl" :alt="props.asset?.name ?? 'Preview'" class="asset-details__img">
        <MarkdownLightbox v-if="lightboxMarkdown" :markdown="lightboxMarkdown" :container="previewContainer" />
      </Flex>

      <Card class="card-bg">
        <Flex column gap="l" expand>
          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Path:</span>
            <CopyValue :text="props.asset.path" />
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Size:</span>
            <span><code>{{ formatBytes(props.asset.size) }}</code></span>
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Content Type:</span>
            <span><code>{{ props.asset.mimeType ?? 'Unknown' }}</code></span>
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Created:</span>
            <TimestampDate :date="props.asset.created_at ?? null" />
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Updated:</span>
            <TimestampDate :date="props.asset.updated_at ?? null" />
          </Grid>
        </Flex>
      </Card>

      <Card v-if="assetUrl" class="asset-details__clipboard card-bg">
        <Flex column gap="l" expand>
          <Flex y-end expand gap="xs">
            <Input
              class="flex-1"
              expand
              readonly
              :model-value="assetUrl"
              label="Public URL"
            />
            <CopyClipboard :text="assetUrl" confirm>
              <Button square variant="gray">
                <Icon name="ph:copy" size="18" />
              </Button>
            </CopyClipboard>
            <Button square variant="gray" @click="openInNewTab">
              <!-- Open -->
              <Icon name="ph:arrow-square-out" size="18" />
            </Button>
          </Flex>

          <Flex v-if="markdownSnippet" y-end expand gap="xs">
            <Input
              class="flex-1"
              expand
              readonly
              :model-value="markdownSnippet"
              label="Markdown snippet"
            />
            <CopyClipboard :text="markdownSnippet" confirm>
              <Button square variant="gray">
                <Icon name="ph:copy" size="18" />
              </Button>
            </CopyClipboard>
            <Button square variant="gray" @click="openInNewTab">
              <Icon name="ph:arrow-square-out" size="18" />
            </Button>
          </Flex>
        </Flex>
      </Card>
    </Flex>
  </Sheet>
</template>

<style scoped lang="scss">
@use '@/assets/mixins' as *;

:global(.asset-details-header p) {
  @include line-clamp(1);
  max-width: 200px;

  a {
    text-decoration: underline;
  }
}

.asset-details {
  &__preview {
    border-radius: var(--border-radius-l);
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-raised);

    img,
    video {
      width: 100%;
      height: auto;
      display: block;
    }
  }

  &__text-preview {
    max-height: 640px;
    width: 100%;
    overflow-y: auto;
    padding: var(--space-s);
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--color-bg-lowered);

    code {
      font-family: inherit;
      font-size: inherit;
    }

    &--loading,
    &--error {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
    }
  }

  &__img {
    cursor: pointer;
  }

  &__video {
    max-height: 320px;
    object-fit: contain;
    background: #000;
  }

  &__code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    padding: var(--space-xs);
    word-break: break-all;
  }
}
</style>
