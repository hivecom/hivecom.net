<script setup lang="ts">
</script>

<template>
  <div class="page">
    <div class="visualization-wrapper">
      <div class="visualization">
        <div class="blob-field">
          <div class="orb orb-a" />
          <div class="orb orb-b" />
          <div class="orb orb-c" />
          <div class="orb orb-d" />
          <div class="orb orb-e" />
          <div class="orb orb-f" />
        </div>

        <div class="logo-wrap">
          <h1 style="color: var(--color-text-invert);">
            HIVECOM
          </h1>
        </div>
      </div>
    </div>

    <svg class="metaball-defs" aria-hidden="true">
      <defs>
        <filter id="metaball">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12"
            result="goo"
          />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </defs>
    </svg>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.visualization-wrapper {
  display: grid;
  place-items: center;
  min-height: 50vh;
}

.visualization {
  position: relative;
  width: min(520px, 90%);
  height: max(60vh, 780px);
  border-radius: 28px;
  background:
    radial-gradient(ellipse at 28% 22%, rgba(51, 255, 0, 0.25), transparent 46%),
    radial-gradient(ellipse at 68% 70%, rgba(120, 252, 160, 0.25), transparent 52%),
    radial-gradient(ellipse at 50% 46%, rgba(255, 255, 255, 0.08), transparent 58%);
  filter: drop-shadow(0 25px 45px rgba(0, 0, 0, 0.35));
  overflow: hidden;
  isolation: isolate;
  animation: breathe 18s ease-in-out infinite;
}

.blob-field {
  position: absolute;
  inset: -6%;
  filter: url('#metaball');
}

.logo-wrap {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  z-index: 4;
}

.logo {
  filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.45));
  opacity: 0.92;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(16px);
  mix-blend-mode: screen;
  opacity: 0.88;
}

.orb-a {
  width: 58%;
  height: 58%;
  left: 8%;
  top: 12%;
  background: radial-gradient(circle, rgba(144, 255, 39, 0.55), rgba(0, 0, 0, 0.04));
  opacity: 0.72;
  animation: drift-a 18s ease-in-out infinite;
}

.orb-b {
  width: 54%;
  height: 54%;
  right: 6%;
  bottom: 8%;
  background: radial-gradient(circle, rgba(119, 255, 0, 0.58), rgba(0, 0, 0, 0.05));
  animation: drift-b 22s ease-in-out infinite;
  opacity: 0.92;
}

.orb-c {
  width: 42%;
  height: 42%;
  left: 30%;
  bottom: 18%;
  background: radial-gradient(circle, rgba(105, 185, 117, 0.65), rgba(0, 0, 0, 0.08));
  animation: drift-c 20s ease-in-out infinite;
  opacity: 0.92;
}

.orb-d {
  width: 32%;
  height: 32%;
  right: 18%;
  top: 18%;
  background: radial-gradient(circle, rgba(120, 252, 160, 0.7), rgba(255, 255, 255, 0.08));
  animation: drift-d 24s ease-in-out infinite;
  opacity: 0.96;
}

.orb-e {
  width: 28%;
  height: 28%;
  left: 18%;
  bottom: 8%;
  background: radial-gradient(circle, rgba(0, 255, 185, 0.6), rgba(0, 0, 0, 0.06));
  animation: drift-e 26s ease-in-out infinite;
  opacity: 0.96;
}

.orb-f {
  width: 34%;
  height: 34%;
  left: 44%;
  top: 8%;
  background: radial-gradient(circle, rgba(180, 255, 140, 0.68), rgba(0, 0, 0, 0.05));
  animation: drift-f 24s ease-in-out infinite;
  opacity: 0.94;
}

@keyframes drift-a {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  25% {
    transform: translate3d(248%, -36%, 0) scale(1.12);
  }
  50% {
    transform: translate3d(72%, 60%, 0) scale(1.06);
  }
  75% {
    transform: translate3d(-36%, 48%, 0) scale(1.1);
  }
}

@keyframes drift-b {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  30% {
    transform: translate3d(-60%, 136%, 0) scale(1.1);
  }
  60% {
    transform: translate3d(36%, -48%, 0) scale(1.06);
  }
}

@keyframes drift-c {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  20% {
    transform: translate3d(60%, -154%, 0) scale(1.14);
  }
  50% {
    transform: translate3d(-48%, 36%, 0) scale(0.9);
  }
  80% {
    transform: translate3d(-24%, -60%, 0) scale(1.08);
  }
}

@keyframes drift-d {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  30% {
    transform: translate3d(-84%, 60%, 0) scale(1.12);
  }
  60% {
    transform: translate3d(60%, -72%, 0) scale(0.92);
  }
}

@keyframes drift-e {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.02);
  }
  25% {
    transform: translate3d(108%, -240%, 0) scale(1.16);
  }
  55% {
    transform: translate3d(-60%, 72%, 0) scale(0.9);
  }
}

@keyframes drift-f {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.08);
  }
  30% {
    transform: translate3d(54%, 72%, 0) scale(1.14);
  }
  65% {
    transform: translate3d(-181%, -54%, 0) scale(0.96);
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(0.995) translateY(2px);
  }
  50% {
    transform: scale(1.01) translateY(-4px);
  }
}
</style>
