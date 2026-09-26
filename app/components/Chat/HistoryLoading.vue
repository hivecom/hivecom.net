<template>
  <div class="chat-history-loading" role="status" aria-label="Loading messages">
    <span class="chat-history-loading__dots" aria-hidden="true">
      <span /><span /><span />
    </span>
  </div>
</template>

<style lang="scss" scoped>
.chat-history-loading {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-s) var(--space-m);
  flex-shrink: 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border-weak);
  }

  &__dots {
    display: flex;
    gap: 4px;
    align-items: center;

    span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-text-lightest);
      animation: chat-history-bounce 1.2s ease-in-out infinite;

      // Keep the color pulse, drop the bounce.
      @media (prefers-reduced-motion: reduce) {
        animation-name: chat-history-pulse;
      }

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
  }
}

@keyframes chat-history-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    background: var(--color-text-lightest);
  }

  30% {
    transform: translateY(-4px);
    background: var(--color-accent);
  }
}

@keyframes chat-history-pulse {
  0%,
  60%,
  100% {
    background: var(--color-text-lightest);
  }

  30% {
    background: var(--color-accent);
  }
}
</style>
