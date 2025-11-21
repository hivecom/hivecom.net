<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import AnnouncementKPIs from '@/components/Admin/Announcements/AnnouncementKPIs.vue'
import AnnouncementTable from '@/components/Admin/Announcements/AnnouncementTable.vue'

// State for refresh coordination between components
const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Announcements</h1>
      <p class="text-color-light">
        Write and manage announcements for the community
      </p>
    </Flex>

    <!-- Announcement KPIs -->
    <AnnouncementKPIs v-model:refresh-signal="refreshSignal" />

    <!-- Announcement Table -->
    <AnnouncementTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
