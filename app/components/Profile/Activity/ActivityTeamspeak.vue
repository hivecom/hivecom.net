<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
</script>

<template>
  <div class="activity-item">
    <Flex y-center x-between gap="s">
      <div>
        <span class="activity-item__label">
          <Icon class="activity-item__icon" name="mdi:steam" size="13" />
          Voice</span>
        <strong class="activity-item__title">#poke-if-needed</strong>
      </div>

      <RegionIndicator size="xxl" region="eu" :show-label="false" />
    </Flex>
  </div>
</template>
