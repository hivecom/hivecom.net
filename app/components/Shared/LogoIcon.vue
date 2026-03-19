<template>
  <NuxtLink to="/" aria-label="Hivecom home" class="icon-link">
    <svg class="icon" viewBox="0 0 2048 2048" xmlns="http://www.w3.org/2000/svg">
      <g transform="matrix(64,0,0,64,0,0)">
        <path
          d="M0,6C0,2.686 2.686,0 6,0L26,0C29.314,0 32,2.686 32,6L32,26C32,29.314 29.314,32 26,32L6,32C2.686,32 0,29.314 0,26L0,6Z"
          fill="currentColor"
        />
      </g>
      <g transform="matrix(64,0,0,64,0,0)">
        <path
          d="M21,10L23.88,10L23.88,21.2L21,21.2L21,16.816L11.88,16.816L11.88,21.2L9,21.2L9,10L11.88,10L11.88,14.384L21,14.384L21,10Z"
          class="icon-letter"
        />
      </g>
    </svg>
  </NuxtLink>
</template>

<style scoped lang="scss">
.icon-link {
  color: var(--color-accent);
  display: inline-flex;
}

.icon {
  width: 36px;
  display: block;
}

.icon-letter {
  fill: var(--color-bg);
}
</style>
