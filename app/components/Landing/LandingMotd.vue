<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  fallbackText: string
  batchSize?: number
}>(), {
  batchSize: 100,
})

const supabase = useSupabaseClient()

const displayText = ref(props.fallbackText)
const phase = ref<'idle' | 'out' | 'in'>('idle')
const renderKey = ref(0)
const motdPool = ref<string[]>([])
const totalAvailable = ref<number | null>(null)
const isLoading = ref(false)
const fetchingBatch = ref(false)

const LETTER_STAGGER_MS = 18
const LETTER_OUT_MS = 220
const LETTER_IN_MS = 240
const AUTO_SWITCH_MS = 60_000

let autoTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.fallbackText,
  (next, prev) => {
    if (displayText.value === prev)
      displayText.value = next
  },
)

function scheduleAutoSwitch() {
  if (autoTimer)
    clearTimeout(autoTimer)

  autoTimer = setTimeout(() => {
    void advanceMotd()
  }, AUTO_SWITCH_MS)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function prefersReducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  }
  catch {
    return false
  }
}

function shuffle(list: string[]): string[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = temp
  }
  return arr
}

function getOffset(count: number | null, size: number): number {
  if (!count || count <= size)
    return 0
  return Math.floor(Math.random() * Math.max(1, count - size + 1))
}

async function fetchBatch() {
  if (fetchingBatch.value)
    return

  fetchingBatch.value = true

  try {
    const offset = getOffset(totalAvailable.value, props.batchSize)
    const { data, error, count } = await supabase
      .from('motds')
      .select('message', { count: 'estimated' })
      .order('created_at', { ascending: false })
      .range(offset, offset + props.batchSize - 1)

    if (error)
      throw error

    totalAvailable.value = count ?? totalAvailable.value
    const messages = (data || []).map(entry => entry.message).filter(Boolean)
    motdPool.value = shuffle(messages)
  }
  catch (error) {
    console.error('Failed to fetch MOTDs', error)
  }
  finally {
    fetchingBatch.value = false
  }
}

async function advanceMotd() {
  if (isLoading.value || phase.value !== 'idle')
    return

  isLoading.value = true

  const reduceMotion = prefersReducedMotion()
  if (!reduceMotion)
    phase.value = 'out'

  const fetchPromise = (async () => {
    if (!motdPool.value.length)
      await fetchBatch()

    const next = motdPool.value.pop()
    return next || props.fallbackText
  })()

  if (!reduceMotion) {
    const outTotal = LETTER_OUT_MS + Math.max(0, displayText.value.length - 1) * LETTER_STAGGER_MS
    await sleep(outTotal)
  }

  displayText.value = await fetchPromise
  renderKey.value += 1

  if (!reduceMotion) {
    phase.value = 'in'
    const inTotal = LETTER_IN_MS + Math.max(0, displayText.value.length - 1) * LETTER_STAGGER_MS
    await sleep(inTotal)
    phase.value = 'idle'
  }

  isLoading.value = false

  scheduleAutoSwitch()
}

async function handleClick() {
  await advanceMotd()
}

onMounted(() => {
  scheduleAutoSwitch()
})

onBeforeUnmount(() => {
  if (autoTimer)
    clearTimeout(autoTimer)
})
</script>

<template>
  <p
    class="hero-motd"
    role="button"
    tabindex="0"
    :aria-busy="isLoading"
    :class="{ 'hero-motd--loading': isLoading }"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <span class="visually-hidden">{{ displayText }}</span>

    <span
      :key="`${renderKey}-${displayText}`"
      class="hero-motd__text"
      :class="{
        'hero-motd__text--out': phase === 'out',
        'hero-motd__text--in': phase === 'in',
      }"
      aria-hidden="true"
    >
      <span
        v-for="(char, index) in Array.from(displayText)"
        :key="`${renderKey}-${index}-${char}`"
        class="hero-motd__letter"
        :style="{
          '--i': index,
          '--stagger': `${LETTER_STAGGER_MS}ms`,
        }"
      >{{ char === ' ' ? '\u00A0' : char }}</span>
    </span>
  </p>
</template>

<style scoped>
.hero-motd {
  font-size: var(--font-size-l);
  margin: 0;
  opacity: 0.82;
  cursor: default;
  user-select: none;
  transition:
    opacity var(--transition),
    transform var(--transition);
}

.hero-motd__text {
  display: inline-block;
  min-height: 1.4em;
}

.hero-motd__letter {
  display: inline-block;
  will-change: opacity, transform;
}

.hero-motd__text--out .hero-motd__letter {
  animation-name: hero-motd-letter-out;
  animation-duration: 220ms;
  animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
  animation-fill-mode: both;
  animation-delay: calc(var(--i) * var(--stagger));
}

.hero-motd__text--in .hero-motd__letter {
  animation-name: hero-motd-letter-in;
  animation-duration: 240ms;
  animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
  animation-fill-mode: both;
  animation-delay: calc(var(--i) * var(--stagger));
  text-shadow: 2px 0 0 var(--color-bg) 3px;
}

.hero-motd--loading {
  opacity: 0.82;
  transform: none;
}

@keyframes hero-motd-letter-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(4px);
  }
}

@keyframes hero-motd-letter-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-motd__letter {
    animation: none !important;
  }
}
</style>
