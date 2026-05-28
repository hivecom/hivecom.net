<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useGlobeData } from '@/composables/useGlobeData'
import { useGlobePerf } from '@/composables/useGlobePerf'
import { useGlobeRenderer } from '@/composables/useGlobeRenderer'

const emit = defineEmits<{ ready: [] }>()

const globeEl = ref<HTMLDivElement | null>(null)
const isGlobeVisible = ref(false)

const { loadGlobeData } = useGlobeData()
const { params: perfParams, startProbe, stopProbe } = useGlobePerf()
const { init, destroy } = useGlobeRenderer()

onMounted(async () => {
  if (!import.meta.client)
    return
  const container = globeEl.value
  if (!container)
    return

  try {
    const {
      allCentroids,
      sourceCentroids,
      featureCollection,
      scaledArcCount,
      countryUserCounts,
    } = await loadGlobeData()

    const maxArcs = scaledArcCount(perfParams.value.maxArcs)

    await init(
      container,
      featureCollection,
      allCentroids,
      sourceCentroids,
      maxArcs,
      perfParams.value,
      countryUserCounts,
    )

    // Start the frame-time probe after the globe is visible so we're sampling
    // real render load rather than initialisation overhead.
    startProbe()

    // Wait for two animation frames so the first WebGL frame has actually
    // been painted before we signal readiness. Without this the splash can
    // fade out a tick before the globe shows up.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isGlobeVisible.value = true
        emit('ready')
      })
    })
  }
  catch (error) {
    console.error('Error initializing globe:', error)
  }
})

onBeforeUnmount(() => {
  stopProbe()
  destroy()
  if (globeEl.value)
    globeEl.value.replaceChildren()
})
</script>

<template>
  <div
    ref="globeEl"
    class="hero-globe"
    :class="{ 'is-visible': isGlobeVisible }"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.hero-globe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 2;
  opacity: 0;
  transition: opacity var(--transition-slow);
}

.hero-globe.is-visible {
  opacity: 0.95;
}
</style>
