<script setup lang="ts">
import type { CmsAsset } from '@/lib/utils/cmsAssets'
import { Badge, Button, Card, Flex, pushToast, Sheet } from '@dolanske/vui'

import { computed } from 'vue'
import { formatBytes, isImageAsset } from '@/lib/utils/cmsAssets'

const props = withDefaults(defineProps<{
  asset: CmsAsset | null
  canDelete?: boolean
}>(), {
  canDelete: false,
})

const emit = defineEmits<{
  delete: [asset: CmsAsset]
}>()

const isOpen = defineModel<boolean>('isOpen', { default: false })

const hasPreview = computed(() => props.asset && props.asset.type === 'file' && isImageAsset(props.asset))
const assetUrl = computed(() => props.asset?.publicUrl ?? '')
const markdownSnippet = computed(() => assetUrl.value ? `![${props.asset?.name ?? 'asset'}](${assetUrl.value})` : '')

function closeDrawer() {
  isOpen.value = false
}

async function copyToClipboard(value: string, label: string) {
  if (!value)
    return
  try {
    await navigator.clipboard.writeText(value)
    pushToast(`${label} copied to clipboard`)
  }
  catch (error) {
    console.error('Failed to copy text', error)
    pushToast('Unable to copy value')
  }
}

function openInNewTab() {
  if (assetUrl.value)
    window.open(assetUrl.value, '_blank', 'noopener')
}

function requestDelete() {
  if (!props.asset)
    return
  emit('delete', props.asset)
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.asset && isOpen"
    position="right"
    separator
    :size="560"
    @close="closeDrawer"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column gap="xxs">
          <h4>{{ props.asset?.name ?? 'Asset details' }}</h4>
          <span class="text-xs text-color-light">{{ props.asset?.path }}</span>
        </Flex>
        <Badge v-if="props.asset?.extension" variant="neutral">
          .{{ props.asset.extension }}
        </Badge>
      </Flex>
    </template>

    <Flex v-if="props.asset" column gap="l" class="asset-details">
      <div v-if="hasPreview" class="asset-details__preview">
        <img :src="assetUrl" :alt="props.asset?.name ?? 'Preview'">
      </div>

      <Card>
        <Flex column gap="s">
          <Flex x-between>
            <span class="text-color-light">File Size</span>
            <strong>{{ formatBytes(props.asset.size) }}</strong>
          </Flex>
          <Flex x-between>
            <span class="text-color-light">Content Type</span>
            <strong>{{ props.asset.mimeType ?? 'Unknown' }}</strong>
          </Flex>
          <Flex x-between>
            <span class="text-color-light">Created</span>
            <strong>{{ props.asset.created_at ? new Date(props.asset.created_at).toLocaleString() : '—' }}</strong>
          </Flex>
          <Flex x-between>
            <span class="text-color-light">Updated</span>
            <strong>{{ props.asset.updated_at ? new Date(props.asset.updated_at).toLocaleString() : '—' }}</strong>
          </Flex>
        </Flex>
      </Card>

      <Card v-if="assetUrl" class="asset-details__clipboard">
        <Flex column gap="s">
          <div>
            <span class="text-xs text-color-light">Public URL</span>
            <Flex gap="s" class="mt-xxs">
              <Button size="s" variant="gray" @click="copyToClipboard(assetUrl, 'Public URL')">
                Copy URL
              </Button>
              <Button size="s" variant="gray" @click="openInNewTab">
                Open
              </Button>
            </Flex>
            <div class="asset-details__code mt-xs">
              {{ assetUrl }}
            </div>
          </div>

          <div v-if="markdownSnippet">
            <span class="text-xs text-color-light">Markdown Snippet</span>
            <Flex gap="s" class="mt-xxs">
              <Button size="s" variant="gray" @click="copyToClipboard(markdownSnippet, 'Markdown snippet')">
                Copy Markdown
              </Button>
            </Flex>
            <div class="asset-details__code mt-xs">
              {{ markdownSnippet }}
            </div>
          </div>
        </Flex>
      </Card>

      <Flex x-between>
        <div />
        <Button v-if="props.canDelete" variant="danger" @click="requestDelete">
          <template #start>
            <Icon name="ph:trash" />
          </template>
          Delete File
        </Button>
      </Flex>
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
