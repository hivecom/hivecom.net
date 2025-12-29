<script setup lang="ts">
import { Flex } from '@dolanske/vui'

// interface Props {
//   small?: boolean
// }

// const props = defineProps<Props>()
</script>

<template>
  <div class="activity-item clickable">
    <Flex y-center x-between gap="s">
      <div>
        <span class="activity-item__label">
          <div class="activity-item__audio-bars">
            <span class="activity-item__audio-bars--bar" />
            <span class="activity-item__audio-bars--bar" />
            <span class="activity-item__audio-bars--bar" />
          </div>
          Now listening</span>
        <strong class="activity-item__title">Haywyre - Midnight Mist</strong>
      </div>

      <img width="24" height="24" src="data:image/jpeg;base64,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" alt="">
    </Flex>
  </div>
</template>
