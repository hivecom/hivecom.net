<script setup lang="ts">
import MetaballContainer from '@/components/Shared/MetaballContainer.vue'
</script>

<template>
  <div class="page">
    <MetaballContainer>
      <div class="logo-wrap">
        <h1 class="logo">
          HIVECOM
        </h1>
      </div>
    </MetaballContainer>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.logo-wrap {
  display: grid;
  place-items: center;
  text-align: center;
}

.logo {
  color: var(--color-text-invert);
  letter-spacing: 0.2em;
  filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.45));
  opacity: 0.92;
}
</style>
