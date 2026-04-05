<script setup lang="ts">
export interface TimelineBucket {
  bucketStart: string
  replyCount: number
}

interface Props {
  /** ISO timestamp of the discussion's first reply / created_at */
  start: string
  /** ISO timestamp of the discussion's last activity */
  end: string
  /** Activity buckets from get_discussion_reply_activity_buckets */
  buckets?: TimelineBucket[]
  /**
   * Expected gap between consecutive buckets in milliseconds.
   * Used to detect whether adjacent buckets are part of a continuous active
   * period (gap <= interval) or separated by silence (gap > interval).
   */
  bucketIntervalMs?: number
  /**
   * Fractional position (0-1) of the current scroll position in the reply
   * area. Used to render a "you are here" indicator on the track.
   */
  currentFraction?: number | null
  /** Disables interaction while a navigate is in flight */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  buckets: () => [],
  bucketIntervalMs: 0,
  currentFraction: null,
  loading: false,
})

const emit = defineEmits<{
  navigate: [date: Date]
  navigateToStart: []
}>()

const trackRef = ref<HTMLElement | null>(null)
const isHovering = ref(false)
const hoverFraction = ref(0)

const startMs = computed(() => new Date(props.start).getTime())
const endMs = computed(() => new Date(props.end).getTime())
const spanMs = computed(() => Math.max(1, endMs.value - startMs.value))

const hoverDate = computed(
  () => new Date(startMs.value + hoverFraction.value * spanMs.value),
)

function toFraction(isoDate: string): number {
  return Math.max(0, Math.min(1, (new Date(isoDate).getTime() - startMs.value) / spanMs.value))
}

const maxBucketCount = computed(() =>
  props.buckets.reduce((m, b) => Math.max(m, b.replyCount), 0),
)

interface BucketSegment {
  /** Fraction (0-1) of the top edge of this segment on the track */
  topFraction: number
  /** Fraction (0-1) of the bottom edge. Equal to topFraction for a dot. */
  bottomFraction: number
  /** Peak reply count within the segment - used to scale size / opacity */
  maxCount: number
  /** True when this segment covers a single isolated bucket */
  isSingle: boolean
  /** Tooltip label shown on hover */
  label: string
  /** Opacity 0.25 (quiet) → 1.0 (peak) */
  opacity: number
}

/**
 * Group consecutive buckets into segments.
 * "Consecutive" means the gap between two bucket_start timestamps is no
 * greater than 1.5x the expected bucket interval (allows for DST jitter).
 * Isolated buckets become dots; runs become boxes.
 */
const bucketSegments = computed((): BucketSegment[] => {
  const buckets = props.buckets
  if (buckets.length === 0)
    return []

  const max = maxBucketCount.value || 1
  const intervalMs = props.bucketIntervalMs

  const segments: BucketSegment[] = []
  let runStart = 0
  let runMaxCount = buckets[0]!.replyCount
  let runTotalCount = buckets[0]!.replyCount
  let runLength = 1

  function flushRun(endIdx: number) {
    const first = buckets[runStart]!
    const last = buckets[endIdx]!
    const isSingle = runLength === 1
    // For a box, extend bottom edge by one bucket-width so the last bucket
    // is visually included rather than just marking its start.
    const bucketFraction = intervalMs > 0 ? intervalMs / spanMs.value : 0
    const topFraction = toFraction(first.bucketStart)
    const bottomFraction = isSingle
      ? topFraction
      : Math.min(1, toFraction(last.bucketStart) + bucketFraction)

    const label = isSingle
      ? `${runMaxCount} ${runMaxCount === 1 ? 'reply' : 'replies'}`
      : `${runTotalCount} ${runTotalCount === 1 ? 'reply' : 'replies'} (${runLength} ${intervalMs >= 86400000 ? 'days' : 'periods'})`

    segments.push({
      topFraction,
      bottomFraction,
      maxCount: runMaxCount,
      isSingle,
      label,
      opacity: 0,
    })
  }

  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1]!
    const curr = buckets[i]!
    const gap = new Date(curr.bucketStart).getTime() - new Date(prev.bucketStart).getTime()
    const adjacent = intervalMs > 0 && gap <= intervalMs * 1.5

    if (adjacent) {
      runMaxCount = Math.max(runMaxCount, curr.replyCount)
      runTotalCount += curr.replyCount
      runLength++
    }
    else {
      flushRun(i - 1)
      runStart = i
      runMaxCount = curr.replyCount
      runTotalCount = curr.replyCount
      runLength = 1
    }
  }
  flushRun(buckets.length - 1)

  return segments.map(s => ({
    ...s,
    opacity: 0.25 + (s.maxCount / max) * 0.75,
  }))
})

function onMouseMove(e: MouseEvent) {
  if (!trackRef.value)
    return
  const rect = trackRef.value.getBoundingClientRect()
  hoverFraction.value = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
}

function onMouseEnter(e: MouseEvent) {
  isHovering.value = true
  onMouseMove(e)
}

function onClick() {
  if (props.loading)
    return
  emit('navigate', new Date(hoverDate.value))
}

// "Mar 26" - month + day, always. Two dates in the same month year become
// indistinguishable with "Mar '26 / Mar '26", day disambiguates them.
function formatLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function navigateToStart() {
  if (!props.loading)
    emit('navigateToStart')
}

function navigateToEnd() {
  if (!props.loading)
    emit('navigate', new Date(props.end))
}

function formatTooltip(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <!-- Outer: absolute, full height of .discussion (position: relative parent).
       Sits just outside the discussion's right edge in the dead-zone margin. -->
  <div class="discussion-timeline" aria-hidden="true">
    <!-- Inner: sticky so the scrubber stays in viewport while scrolling. -->
    <div class="discussion-timeline__inner">
      <button
        class="discussion-timeline__label discussion-timeline__label--clickable"
        :disabled="loading"
        @click="navigateToStart"
      >
        {{ formatLabel(start) }}
      </button>

      <div
        ref="trackRef"
        class="discussion-timeline__track"
        :class="{ 'discussion-timeline__track--loading': loading }"
        @mousemove="onMouseMove"
        @mouseenter="onMouseEnter"
        @mouseleave="isHovering = false"
        @click="onClick"
      >
        <!-- Activity segments: dots for isolated buckets, boxes for consecutive runs -->
        <div
          v-for="(seg, i) in bucketSegments"
          :key="i"
          class="discussion-timeline__segment"
          :class="seg.isSingle ? 'discussion-timeline__segment--dot' : 'discussion-timeline__segment--box'"
          :style="{
            top: `${seg.topFraction * 100}%`,
            height: seg.isSingle ? undefined : `${(seg.bottomFraction - seg.topFraction) * 100}%`,
            opacity: seg.opacity,
          }"
        >
          <!-- Per-segment tooltip on hover -->
          <span class="discussion-timeline__segment-label">{{ seg.label }}</span>
        </div>

        <!-- Current position indicator: shows where in the timeline you are -->
        <div
          v-if="currentFraction != null"
          class="discussion-timeline__position"
          :style="{ top: `${currentFraction * 100}%` }"
        />

        <!-- Cursor indicator: tracks mouse position along the track -->
        <div
          v-show="isHovering && !loading"
          class="discussion-timeline__dot"
          :style="{ top: `${hoverFraction * 100}%` }"
        />

        <!-- Date tooltip: appears to the left of the track on hover -->
        <div
          v-show="isHovering && !loading"
          class="discussion-timeline__tooltip"
          :style="{ top: `${hoverFraction * 100}%` }"
        >
          {{ formatTooltip(hoverDate) }}
        </div>
      </div>

      <button
        class="discussion-timeline__label discussion-timeline__label--clickable"
        :disabled="loading"
        @click="navigateToEnd"
      >
        {{ formatLabel(end) }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.discussion-timeline {
  // Positioned just outside the right edge of .discussion (which is position: relative).
  // .discussion is width: 100% of its container, so left: 100% is at the container's right wall.
  // The space between the container wall and the viewport edge is the "dead zone" this lives in.
  position: absolute;
  left: calc(100% + var(--space-m));
  top: 0;
  bottom: 0;
  // Wide enough for the track + hit area; labels overflow to the left naturally.
  width: 24px;
  // Outer shell is pointer-events: none so it doesn't intercept page clicks.
  // The inner re-enables it.
  pointer-events: none;

  // Only show when there is actual dead-zone space to the right.
  @media screen and (max-width: $breakpoint-m) {
    display: none;
  }

  &__inner {
    // Sticky so the scrubber floats in the viewport while the user scrolls.
    // Vertically centered: top at 20vh, height 60vh → sits at 20-80% of viewport.
    position: sticky;
    top: 20vh;
    height: 60vh;
    pointer-events: all;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xxs);
    user-select: none;
  }

  &__label {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    white-space: nowrap;
    line-height: 1;
    opacity: 0.35;
    transition:
      opacity var(--transition),
      color var(--transition);
    // Vertical text so "Mar 26" fits without forcing width.
    writing-mode: vertical-rl;
    // rotate so it reads top-to-bottom (left-to-right rotated 90deg CW)
    transform: rotate(180deg);

    // Reset button defaults
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;

    &--clickable {
      cursor: pointer;
    }

    &--clickable:hover:not(:disabled) {
      opacity: 1;
      color: var(--color-accent);
    }

    &--clickable:disabled {
      cursor: default;
    }
  }

  &__inner:hover &__label {
    opacity: 0.85;
  }

  &__track {
    flex: 1;
    // Wide transparent hit area - makes the 2px bar actually clickable.
    width: 20px;
    background: transparent;
    position: relative;
    cursor: pointer;

    // The visible bar is a 2px line centered inside the 20px hit area.
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      background-color: var(--color-border);
      border-radius: var(--border-radius-l);
      transition:
        background-color var(--transition),
        width var(--transition-fast);
    }

    &:hover::after {
      background-color: var(--color-border-strong);
      width: 3px;
    }

    &--loading {
      opacity: 0.4;
      pointer-events: none;
    }
  }

  &__segment {
    position: absolute;
    left: 50%;
    background-color: var(--color-accent);
    pointer-events: all;
    z-index: 1;

    // Isolated bucket: small centred dot, size reflects activity weight
    &--dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
    }

    // Consecutive run: a rounded bar spanning the active period
    &--box {
      width: 6px;
      border-radius: var(--border-radius-xs);
      transform: translateX(-50%);
      min-height: 6px;
    }

    // Per-segment tooltip: appears to the left, same pattern as the hover tooltip
    &-label {
      display: none;
      position: absolute;
      left: calc(100% + var(--space-xs));
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
      background-color: var(--color-bg-raised);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-s);
      padding: 2px var(--space-xs);
      font-size: var(--font-size-xxs);
      color: var(--color-text);
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 10;
    }

    &:hover &-label {
      display: block;
    }
  }

  &__position {
    // "You are here" line - a horizontal rule across the track
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 2px;
    background-color: var(--color-text-lighter);
    border-radius: 1px;
    pointer-events: none;
    z-index: 3;
  }

  &__dot {
    // Hover cursor indicator: larger accent dot that follows the mouse.
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-accent);
    // Ring cutout to visually separate from the track bar
    box-shadow: 0 0 0 2px var(--color-bg);
    pointer-events: none;
    z-index: 2;
  }

  &__tooltip {
    // Appears to the LEFT of the track. right: 100% = right edge of the 20px track element,
    // then an extra gap, then the tooltip box.
    position: absolute;
    right: calc(100% + var(--space-xs));
    transform: translateY(-50%);
    white-space: nowrap;
    background-color: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    padding: 2px var(--space-xs);
    font-size: var(--font-size-xxs);
    color: var(--color-text);
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 10;
  }
}
</style>
