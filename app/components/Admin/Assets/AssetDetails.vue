<script setup lang="ts">
import type { StorageAsset } from '@/lib/storageAssets'
import { Button, Card, CopyClipboard, Flex, Grid, Input, Sheet } from '@dolanske/vui'

import { computed } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatBytes, isImageAsset } from '@/lib/storageAssets'

const props = withDefaults(defineProps<{
  asset: StorageAsset | null
  canDelete?: boolean
  canRename?: boolean
}>(), {
  canDelete: false,
  canRename: false,
})

const emit = defineEmits<{
  delete: [asset: StorageAsset]
  rename: [asset: StorageAsset]
}>()

const isOpen = defineModel<boolean>('isOpen', { default: false })

const hasPreview = computed(() => props.asset && props.asset.type === 'file' && isImageAsset(props.asset))
const assetUrl = computed(() => props.asset?.publicUrl ?? '')
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
        <Flex column :gap="0">
          <h4>Asset Details</h4>
          <p class="text-xs text-color-light">
            {{ props.asset?.name }}
          </p>
        </Flex>
        <Flex gap="xs" y-center>
          <Button
            v-if="props.canRename"
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
            v-if="props.canDelete"
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
      <div v-if="hasPreview" class="asset-details__preview">
        <img :src="assetUrl" :alt="props.asset?.name ?? 'Preview'">
      </div>

      <Card class="card-bg">
        <Flex column gap="l" expand>
          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Path:</span>
            <span>{{ props.asset?.path }}</span>
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Size:</span>
            <span>{{ formatBytes(props.asset.size) }}</span>
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Content Type:</span>
            <span>{{ props.asset.mimeType ?? 'Unknown' }}</span>
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Created:</span>
            <span>
              {{ props.asset.created_at ? new Date(props.asset.created_at).toLocaleString() : '-' }}
            </span>
          </Grid>

          <Grid class="asset-details__item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Updated:</span>
            <span>
              {{ props.asset.updated_at ? new Date(props.asset.updated_at).toLocaleString() : '-' }}
            </span>
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
.asset-details {
  &__preview {
    border-radius: var(--border-radius-l);
    overflow: hidden;
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-raised);

    img {
      width: 100%;
      height: auto;
      display: block;
    }
  }

  &__code {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    background: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    padding: var(--space-xs);
    word-break: break-all;
  }
}
</style>
