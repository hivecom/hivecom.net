<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const { isForum = false } = defineProps<{ isForum?: boolean }>()

const isMobile = useBreakpoint('<m')
</script>

<template>
  <Flex y-center x-between gap="xs" class="mb-m">
    <!-- Left: view mode ButtonGroup (2 square buttons) -->
    <Flex y-center gap="xs">
      <Flex :gap="1">
        <Skeleton :width="28" :height="28" style="border-radius: var(--border-radius-s) 0 0 var(--border-radius-s);" />
        <Skeleton :width="28" :height="28" style="border-radius: 0 var(--border-radius-s) var(--border-radius-s) 0; margin-left: 1px;" />
      </Flex>
    </Flex>

    <!-- Right: clock + Latest (mobile only) -->
    <Flex v-if="isMobile && isForum" gap="xs">
      <Skeleton :width="28" :height="28" :radius="8" />
      <Skeleton :width="80" :height="28" :radius="8" />
    </Flex>
  </Flex>
</template>
