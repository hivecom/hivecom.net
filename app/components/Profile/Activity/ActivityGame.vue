<script setup lang="ts">
import { Flex } from '@dolanske/vui'
</script>

<template>
  <div class="activity-item">
    <Flex y-center x-between gap="s">
      <div>
        <span class="activity-item__label">
          <Icon class="activity-item__icon" name="mdi:steam" size="13" />
          Playing</span>
        <strong class="activity-item__title">Minecraft</strong>
      </div>

      <!-- Replace image with game icon later -->
      <img src="https://camqocmuyolpjjbnbcha.supabase.co/storage/v1/object/public/hivecom-content-static/games/minecraft/icon.webp" alt="Minecraft icon" width="24" height="24">
    </Flex>
  </div>
</template>
