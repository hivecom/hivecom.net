<script setup lang="ts">
import TeamSpeakViewer from '@/components/Shared/TeamSpeakViewer.vue'

useSeoMeta({
  title: 'Voice Servers',
  description: 'View live voice channels and connect with the community on TeamSpeak.',
  ogTitle: 'Voice Servers',
  ogDescription: 'View live voice channels and connect with the community on TeamSpeak.',
})
</script>

<template>
  <div class="page">
    <section class="page-title">
      <h1>Voice Servers</h1>
      <p>View live channels and connect with the community on TeamSpeak.</p>
    </section>

    <TeamSpeakViewer />
  </div>
</template>
