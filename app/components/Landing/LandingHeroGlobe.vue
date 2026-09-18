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
const { init, destroy, pause, resume } = useGlobeRenderer()

// Parks the globe (render loop, tick, arc spawning) while the hero is scrolled
// off screen - the post chain is far too expensive to run for nobody. Same
// pattern as LandingSun's observer.
let visibilityObserver: IntersectionObserver | null = null

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

    // rootMargin keeps a little slack so the globe is already turning again by
    // the time it scrolls back into view.
    visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry)
        return

      if (entry.isIntersecting)
        resume()
      else
        pause()
    }, { rootMargin: '100px 0px' })
    visibilityObserver.observe(container)

    // Wait for two animation frames so the first WebGL frame has actually
    // been painted before we signal readiness. Without this the planet ghost
    // can fade out a tick before the globe shows up.
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
  visibilityObserver?.disconnect()
  visibilityObserver = null
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
  // Long fade so the planet resolves out of the blurred ghost behind it
  // instead of popping in (--transition-slow is only 0.15s).
  transition: opacity 1400ms ease;

  // The canvas stops dead on the hero's bottom edge, and the bloom pass puts
  // real light right up against it: arcs flaring off the limb, the phosphor
  // trail they leave behind. Cut flat, that glow draws a straight line across
  // the page at the section boundary. Fading the layer out over the last slice
  // lets it die into the backdrop instead. The stops are eased rather than a
  // straight ramp, since a linear fade leaves a visible corner where it starts.
  --hero-globe-fade: linear-gradient(
    to bottom,
    #000 0%,
    #000 90%,
    rgba(0, 0, 0, 0.82) 94%,
    rgba(0, 0, 0, 0.4) 97.5%,
    transparent 100%
  );
  -webkit-mask-image: var(--hero-globe-fade);
  mask-image: var(--hero-globe-fade);
}

.hero-globe.is-visible {
  opacity: 0.95;
}
</style>
