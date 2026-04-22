<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import { Flex } from '@dolanske/vui'

type UrlData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']> & { type: 'unknown' }

defineProps<{
  data: UrlData
}>()
</script>

<template>
  <NuxtLink
    class="link-embed link-embed--unknown"
    :href="data.href"
  >
    <Flex y-center gap="s" class="link-embed__body">
      <Icon name="ph:link" class="link-embed__icon" />
      <span class="link-embed__title link-embed__title--url">{{ data.label }}</span>
    </Flex>
  </NuxtLink>
</template>

<style scoped lang="scss">
.link-embed--unknown {
  border-left-color: var(--color-border-strong);

  .link-embed__icon {
    color: var(--color-text-lighter);
  }
}

.link-embed__title--url {
  font-size: var(--font-size-xs);
  font-weight: 400;
  color: var(--color-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
