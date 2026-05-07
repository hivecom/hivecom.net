<script setup lang="ts">
import type { StorageAsset } from '@/lib/storageAssets'
import { Button, Card, CopyClipboard, Flex, Grid, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { formatBytes, FORUMS_BUCKET_ID, isImageAsset, isVideoAsset } from '@/lib/storageAssets'

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
}>()

const emit = defineEmits<{
  clickAsset: [asset: StorageAsset]
  deleteAsset: [asset: StorageAsset]
}>()

const gridColumns = computed(() =>
  props.columns ? `repeat(${props.columns}, 1fr)` : 'repeat(auto-fill, minmax(200px, 1fr))',
)

function handleCardClick(asset: StorageAsset) {
  if (asset.type === 'folder') {
    emit('clickAsset', asset)
    return
  }
  if (asset.publicUrl)
    window.open(asset.publicUrl, '_blank', 'noopener')
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
      @click="handleCardClick(asset)"
    >
      <div class="asset-grid-preview" :class="{ 'is-folder': asset.type === 'folder' }">
        <template v-if="asset.type === 'folder'">
          <Icon name="ph:folder-simple" size="32" />
        </template>
        <template v-else-if="isImageAsset(asset) && asset.publicUrl">
          <img :src="asset.publicUrl" :alt="asset.name" loading="lazy">
        </template>
        <template v-else-if="isVideoAsset(asset) && asset.publicUrl">
          <video :src="asset.publicUrl" autoplay loop muted playsinline preload="auto" class="asset-grid-video" />
        </template>
        <template v-else>
          <Icon name="ph:file" size="32" />
        </template>

        <div v-if="asset.type !== 'folder'" class="asset-grid-actions" @click.stop>
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
            <Button size="s" variant="gray" square @click="asset.publicUrl && handleCardClick(asset)">
              <Icon name="ph:arrow-square-out" size="16" />
            </Button>
            <template #tooltip>
              <p>Open</p>
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

      <Flex column gap="xxs">
        <strong class="text-s asset-grid-name">{{ asset.name }}</strong>
        <span class="text-xxs text-color-light">{{ asset.type === 'folder' ? 'Folder' : formatBytes(asset.size) }}</span>
        <Flex v-if="isForumsBucket && asset.type !== 'folder'" y-center gap="xxs">
          <span class="text-xxs text-color-light">Uploaded by</span>
          <UserLink :user-id="getUploaderId(asset)" placeholder="Unknown" class="text-xxs" />
        </Flex>
      </Flex>
    </Card>
  </Grid>
</template>

<style scoped lang="scss">
.asset-grid-card {
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
  transition: border-color var(--transition);

  &:hover {
    border-color: var(--color-accent);
  }
}

.asset-grid-preview {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: var(--border-radius-m);
  margin-bottom: var(--space-s);
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

  .asset-grid-card:hover & {
    opacity: 1;
  }
}

.asset-grid-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
</style>
