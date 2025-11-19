<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import ProjectTable from '@/components/Admin/Projects/ProjectTable.vue'

// State for refresh coordination between components
const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Projects</h1>
      <p class="text-color-light">
        Manage Projects from the community
      </p>
    </Flex>

    <!-- Project Table -->
    <ProjectTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
