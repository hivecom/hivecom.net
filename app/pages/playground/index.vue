<script setup lang="ts">
import Discussion from '@/components/Discussions/Discussion.vue'

const userId = useUserId()
</script>

<template>
  <div style="padding-block: 128px;width:100%">
    <div class="container container-m">
      <Discussion v-if="userId" :id="userId" type="profile" />
    </div>
  </div>
</template>
