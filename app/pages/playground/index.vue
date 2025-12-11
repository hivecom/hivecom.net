<script setup lang="ts">

</script>

<template>
  <div class="hero-stage">
    <div class="hero-content">
      <LandingHeroPrototype
        :pinned-announcements="[]"
        :community-stats="{
          members: 0,
          membersAccurate: false,
          gameservers: 0,
          age: 0,
          projects: 0,
        }"
        :loading="true"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-stage {
  position: relative;
  min-height: 100vh;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: auto;
}
</style>
