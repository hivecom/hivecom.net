<script setup lang='ts'>
import { Card, Flex, Skeleton } from '@dolanske/vui'

import { useBreakpoint } from '@/lib/mediaQuery'

const isBelowSmall = useBreakpoint('<s')
</script>

<template>
  <div class="loading-skeleton">
    <!-- Back button skeleton -->
    <Flex class="mb-m">
      <Skeleton :width="120" :height="36" :radius="8" />
    </Flex>

    <!-- Header section skeleton -->
    <section class="mb-l">
      <Flex :gap="0" expand column>
        <Flex y-start x-between gap="xl" expand class="mb-m">
          <!-- Title skeleton -->
          <div class="flex-1">
            <Skeleton :width="400" :height="40" :radius="8" class="mb-s" />
          </div>
          <!-- User display skeleton -->
          <Flex gap="s" y-center>
            <Skeleton :width="32" :height="32" style="border-radius: 50%;" />
            <Skeleton :width="80" :height="20" :radius="4" />
          </Flex>
        </Flex>

        <!-- Description skeleton -->
        <Skeleton :width="320" :height="24" :radius="4" class="mb-m" />

        <!-- Badges skeleton -->
        <Flex gap="xs" class="mb-m">
          <Skeleton :width="60" :height="24" :radius="12" />
          <Skeleton :width="100" :height="24" :radius="12" />
          <Skeleton :width="80" :height="24" :radius="12" />
        </Flex>
      </Flex>
    </section>

    <!-- Voting section skeleton -->
    <section class="mb-xl">
      <Card :class="{ 'p-l': !isBelowSmall }">
        <Skeleton :width="140" :height="24" :radius="4" class="mb-m" />

        <!-- Choices skeleton -->
        <div class="mb-l">
          <div v-for="n in 3" :key="n" class="choice-skeleton">
            <Skeleton :height="56" :radius="8" />
          </div>
        </div>

        <!-- Buttons skeleton -->
        <Flex gap="s" y-center>
          <Skeleton :width="120" :height="40" :radius="8" />
          <Skeleton :width="100" :height="40" :radius="8" />
        </Flex>
      </Card>
    </section>

    <!-- Results section skeleton -->
    <section>
      <Card :class="{ 'p-l': !isBelowSmall }">
        <Skeleton :width="80" :height="24" :radius="4" class="mb-m" />
        <Skeleton :height="120" :radius="8" />
      </Card>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.loading-skeleton {
  .choice-skeleton {
    margin-bottom: var(--space-s);
  }
}
</style>
