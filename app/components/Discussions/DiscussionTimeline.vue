<script setup lang="ts">
import { Button, Calendar, Flex, Modal } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

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
  /** Off-topic-only activity buckets - rendered as a second layer in warning color */
  offtopicBuckets?: TimelineBucket[]
  /**
   * Time range of the unloaded gap, if one exists. Rendered as a dashed
   * region on the track so users can see what they'd be skipping.
   */
  gapRange?: { start: string, end: string } | null
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
  offtopicBuckets: () => [],
  gapRange: null,
  bucketIntervalMs: 0,
  currentFraction: null,
  loading: false,
})

const emit = defineEmits<{
  navigate: [date: Date]
  navigateToStart: []
  navigateToEnd: []
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

const maxOfftopicBucketCount = computed(() =>
  props.offtopicBuckets.reduce((m, b) => Math.max(m, b.replyCount), 0),
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
  /**
   * The date to pass to navigateToDate when this segment is clicked.
   * - Dot: end of the bucket window (bucketStart + intervalMs) so that floor
   *   semantics ("last reply at or before target") land inside this bucket,
   *   not the one before it.
   * - Box: midpoint of the run, which is well inside the active period.
   */
  targetDate: Date
}

/**
 * Group consecutive buckets into segments.
 * "Consecutive" means the gap between two bucket_start timestamps is no
 * greater than 1.5x the expected bucket interval (allows for DST jitter).
 * Isolated buckets become dots; runs become boxes.
 */
function buildSegments(buckets: TimelineBucket[], max: number): BucketSegment[] {
  if (buckets.length === 0)
    return []

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
    const bucketFraction = intervalMs > 0 ? intervalMs / spanMs.value : 0
    const topFraction = toFraction(first.bucketStart)
    const bottomFraction = isSingle
      ? topFraction
      : Math.min(1, toFraction(last.bucketStart) + bucketFraction)

    const label = isSingle
      ? `${runMaxCount} ${runMaxCount === 1 ? 'reply' : 'replies'}`
      : `${runTotalCount} ${runTotalCount === 1 ? 'reply' : 'replies'} (${runLength} ${intervalMs >= 86400000 ? 'days' : 'periods'})`

    // Use the START of the first bucket as the target date.
    // navigateToDate is called with findFirst: true, which uses ceiling
    // semantics in the RPC ("first reply at or after target"). Passing the
    // bucket start time means the RPC returns the very first reply in the
    // segment - exactly what the user expects when clicking a block.
    // The old approach of passing firstMs + intervalMs with floor semantics
    // returned the LAST reply in the first bucket instead, causing the
    // viewport to land on reply #2 (or later) rather than reply #1.
    const firstMs = new Date(first.bucketStart).getTime()
    const targetDate = new Date(firstMs)

    segments.push({
      topFraction,
      bottomFraction,
      maxCount: runMaxCount,
      isSingle,
      label,
      opacity: 0,
      targetDate,
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
    opacity: 0.25 + (s.maxCount / (max || 1)) * 0.75,
  }))
}

const bucketSegments = computed((): BucketSegment[] => {
  return buildSegments(props.buckets, maxBucketCount.value)
})

const offtopicSegments = computed((): BucketSegment[] => {
  return buildSegments(props.offtopicBuckets, maxOfftopicBucketCount.value)
})

/** Fractional range [top, bottom] of the unloaded gap on the track, or null. */
const gapFractions = computed((): { top: number, bottom: number } | null => {
  if (props.gapRange == null)
    return null
  return {
    top: toFraction(props.gapRange.start),
    bottom: toFraction(props.gapRange.end),
  }
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

function onSegmentClick(seg: BucketSegment) {
  if (props.loading)
    return

  // For a box segment, use the hover position to pick a date proportionally
  // within the segment's time range, so clicking the middle of a tall group
  // navigates to the middle, not always the top.
  if (!seg.isSingle && seg.topFraction < seg.bottomFraction) {
    const segSpan = seg.bottomFraction - seg.topFraction
    const relFraction = Math.max(0, Math.min(1, (hoverFraction.value - seg.topFraction) / segSpan))
    const segStartMs = startMs.value + seg.topFraction * spanMs.value
    const segEndMs = startMs.value + seg.bottomFraction * spanMs.value
    const targetMs = segStartMs + relFraction * (segEndMs - segStartMs)
    emit('navigate', new Date(targetMs))
    return
  }

  emit('navigate', seg.targetDate)
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
    emit('navigateToEnd')
}

function formatTooltip(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const hoveredSegment = computed((): BucketSegment | null => {
  if (!isHovering.value)
    return null
  const f = hoverFraction.value
  // Check offtopic layer first - it renders on top
  for (const seg of offtopicSegments.value) {
    if (seg.isSingle) {
      if (Math.abs(f - seg.topFraction) <= 0.02)
        return seg
    }
    else {
      if (f >= seg.topFraction && f <= seg.bottomFraction)
        return seg
    }
  }
  // Fall back to normal segments
  for (const seg of bucketSegments.value) {
    if (seg.isSingle) {
      if (Math.abs(f - seg.topFraction) <= 0.02)
        return seg
    }
    else {
      if (f >= seg.topFraction && f <= seg.bottomFraction)
        return seg
    }
  }
  return null
})

/** True when the cursor is over a clickable segment. */
const isOverSegment = computed(() => hoveredSegment.value != null)

const tooltipText = computed((): string => {
  const date = formatTooltip(hoverDate.value)
  if (hoveredSegment.value != null)
    return `${date}\n${hoveredSegment.value.label}`
  return date
})

// ─── Jump-to-date modal ───────────────────────────────────────────────────────

const isMobile = useBreakpoint('<s')
const showJumpModal = ref(false)
const jumpDate = ref<Date | null>(null)

function openJumpModal() {
  if (props.currentFraction != null) {
    const ms = startMs.value + props.currentFraction * spanMs.value
    jumpDate.value = new Date(ms)
  }
  else {
    jumpDate.value = new Date(props.start)
  }
  showJumpModal.value = true
}

function onCalendarDateSelect(date: Date | null) {
  if (!date)
    return
  emit('navigate', date)
  showJumpModal.value = false
}

function handleModalSegmentClick(seg: BucketSegment) {
  if (props.loading)
    return
  emit('navigate', seg.targetDate)
  showJumpModal.value = false
}

defineExpose({ openJumpModal })
</script>

<template>
  <!-- Outer: absolute, full height of .discussion (position: relative parent).
       Sits just outside the discussion's right edge in the dead-zone margin. -->
  <div class="discussion-timeline" aria-hidden="true">
    <!-- Inner: sticky so the scrubber stays in viewport while scrolling. -->
    <div class="discussion-timeline__inner">
      <button
        class="discussion-timeline__jump-btn"
        title="Jump to date"
        @click="openJumpModal"
      >
        <Icon name="ph:clock" size="12" />
      </button>

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
        :class="{ 'discussion-timeline__track--loading': loading,
                  'discussion-timeline__track--over-segment': isOverSegment }"
        @mousemove="onMouseMove"
        @mouseenter="onMouseEnter"
        @mouseleave="isHovering = false"
      >
        <!-- Track bar: split into solid/dashed/solid segments around the gap.
             When no gap exists, a single full-height solid bar is rendered. -->
        <template v-if="gapFractions != null">
          <div
            class="discussion-timeline__bar" :style="{ top: '0%',
                                                       height: `${gapFractions.top * 100}%` }"
          />
          <div
            class="discussion-timeline__bar discussion-timeline__bar--gap" :style="{ top: `${gapFractions.top * 100}%`,
                                                                                     height: `${(gapFractions.bottom - gapFractions.top) * 100}%` }"
          />
          <div
            class="discussion-timeline__bar" :style="{ top: `${gapFractions.bottom * 100}%`,
                                                       height: `${(1 - gapFractions.bottom) * 100}%` }"
          />
        </template>
        <div v-else class="discussion-timeline__bar" style="top: 0%; height: 100%;" />
        <!-- Activity segments: dots for isolated buckets, boxes for consecutive runs -->
        <div
          v-for="(seg, i) in bucketSegments"
          :key="`main-${i}`"
          class="discussion-timeline__segment"
          :class="seg.isSingle ? 'discussion-timeline__segment--dot' : 'discussion-timeline__segment--box'"
          :style="{
            top: `${seg.topFraction * 100}%`,
            height: seg.isSingle ? undefined : `${(seg.bottomFraction - seg.topFraction) * 100}%`,
            opacity: seg.opacity,
          }"
          @click="onSegmentClick(seg)"
        />

        <!-- Off-topic segments: second layer in warning color -->
        <div
          v-for="(seg, i) in offtopicSegments"
          :key="`offtopic-${i}`"
          class="discussion-timeline__segment discussion-timeline__segment--offtopic"
          :class="seg.isSingle ? 'discussion-timeline__segment--dot' : 'discussion-timeline__segment--box'"
          :style="{
            top: `${seg.topFraction * 100}%`,
            height: seg.isSingle ? undefined : `${(seg.bottomFraction - seg.topFraction) * 100}%`,
            opacity: seg.opacity,
          }"
          @click="onSegmentClick(seg)"
        />

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

        <!-- Merged tooltip: appears to the right of the track on hover -->
        <div
          v-show="isHovering && !loading"
          class="discussion-timeline__tooltip"
          :style="{ top: `${hoverFraction * 100}%` }"
        >
          <template v-for="(line, i) in tooltipText.split('\n')" :key="i">
            <span :class="i === 0 ? 'discussion-timeline__tooltip-date' : 'discussion-timeline__tooltip-count'">{{ line }}</span>
          </template>
        </div>
      </div>

      <button
        class="discussion-timeline__label discussion-timeline__label--clickable discussion-timeline__label--end"
        :disabled="loading"
        @click="navigateToEnd"
      >
        {{ formatLabel(end) }}
      </button>
    </div>
  </div>

  <!-- Jump-to-date modal - sits outside aria-hidden wrapper -->
  <Modal
    :open="showJumpModal"
    :size="isMobile ? 'screen' : 'l'"
    :card="{ separators: true }"
    @close="showJumpModal = false"
  >
    <template #header>
      <Flex y-center gap="m">
        <h4>Jump to Date</h4>
        <Calendar
          v-model="jumpDate"
          :min-date="new Date(props.start)"
          :max-date="new Date(props.end)"
          format="MMM d, yyyy"
          @update:model-value="onCalendarDateSelect"
        >
          <template #trigger>
            <Button variant="gray">
              {{ jumpDate ? jumpDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }) : 'Pick a date' }}
              <template #end>
                <Icon name="ph:calendar" />
              </template>
            </Button>
          </template>
        </Calendar>
      </Flex>
    </template>

    <Flex column gap="l" class="timeline-jump-modal">
      <!-- Expanded timeline: centred two-column layout -->
      <div class="timeline-jump-modal__track-area">
        <!-- Start anchor above the shared row -->
        <span class="timeline-jump-modal__anchor">{{ formatLabel(start) }}</span>

        <!-- inner-row: track-col and labels-col share identical height -->
        <div class="timeline-jump-modal__inner-row">
          <!-- Left column: the vertical track -->
          <div class="timeline-jump-modal__track-col">
            <div class="timeline-jump-modal__track">
              <template v-if="gapFractions != null">
                <div
                  class="discussion-timeline__bar"
                  :style="{
                    top: '0%',
                    height: `${gapFractions.top * 100}%`,
                  }"
                />
                <div
                  class="discussion-timeline__bar discussion-timeline__bar--gap"
                  :style="{
                    top: `${gapFractions.top * 100}%`,
                    height: `${(gapFractions.bottom - gapFractions.top) * 100}%`,
                  }"
                />
                <div
                  class="discussion-timeline__bar"
                  :style="{
                    top: `${gapFractions.bottom * 100}%`,
                    height: `${(1 - gapFractions.bottom) * 100}%`,
                  }"
                />
              </template>
              <div v-else class="discussion-timeline__bar" style="top: 0%; height: 100%;" />

              <div
                v-for="(seg, i) in bucketSegments"
                :key="`mjm-${i}`"
                class="discussion-timeline__segment timeline-jump-modal__segment"
                :class="seg.isSingle ? 'discussion-timeline__segment--dot' : 'discussion-timeline__segment--box'"
                :style="{
                  top: `${seg.topFraction * 100}%`,
                  height: seg.isSingle ? undefined : `${(seg.bottomFraction - seg.topFraction) * 100}%`,
                  opacity: seg.opacity,
                }"
                @click="handleModalSegmentClick(seg)"
              />
              <div
                v-for="(seg, i) in offtopicSegments"
                :key="`mjot-${i}`"
                class="discussion-timeline__segment discussion-timeline__segment--offtopic timeline-jump-modal__segment"
                :class="seg.isSingle ? 'discussion-timeline__segment--dot' : 'discussion-timeline__segment--box'"
                :style="{
                  top: `${seg.topFraction * 100}%`,
                  height: seg.isSingle ? undefined : `${(seg.bottomFraction - seg.topFraction) * 100}%`,
                  opacity: seg.opacity,
                }"
                @click="handleModalSegmentClick(seg)"
              />

              <div
                v-if="currentFraction != null"
                class="discussion-timeline__position"
                :style="{ top: `${currentFraction * 100}%` }"
              />
            </div>
          </div>

          <!-- Right column: always-visible labels -->
          <div class="timeline-jump-modal__labels-col">
            <button
              v-for="(seg, i) in bucketSegments"
              :key="`mjl-${i}`"
              class="timeline-jump-modal__label"
              :style="{ top: `${((seg.topFraction + seg.bottomFraction) / 2) * 100}%` }"
              @click="handleModalSegmentClick(seg)"
            >
              <span class="timeline-jump-modal__label-date">{{ formatTooltip(seg.targetDate) }}</span>
              <span class="timeline-jump-modal__label-count">{{ seg.label }}</span>
            </button>
            <button
              v-for="(seg, i) in offtopicSegments"
              :key="`mjlo-${i}`"
              class="timeline-jump-modal__label timeline-jump-modal__label--offtopic"
              :style="{ top: `${((seg.topFraction + seg.bottomFraction) / 2) * 100}%` }"
              @click="handleModalSegmentClick(seg)"
            >
              <span class="timeline-jump-modal__label-date">{{ formatTooltip(seg.targetDate) }}</span>
              <span class="timeline-jump-modal__label-count">{{ seg.label }}</span>
            </button>
          </div>
        </div>

        <!-- End anchor below the shared row -->
        <span class="timeline-jump-modal__anchor">{{ formatLabel(end) }}</span>
      </div>
    </Flex>

    <template #footer="{ close }">
      <Flex x-end expand>
        <Button @click="close">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.timeline-jump-modal {
  height: 100%;

  &__track-area {
    display: flex;
    flex-direction: column;
    max-width: 560px;
    width: 100%;
    margin: 0 auto;
    height: calc(86vh - 134px);
    min-height: 400px;

    @media screen and (max-width: $breakpoint-s) {
      height: calc(98vh - 134px);
      max-width: 100%;
    }
  }

  &__inner-row {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  &__track-col {
    flex-shrink: 0;
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &__track {
    flex: 1;
    width: 100%;
    position: relative;
  }

  // Bigger segments inside the modal
  &__segment {
    &.discussion-timeline__segment--dot {
      width: 12px !important;
      height: 12px !important;
    }

    &.discussion-timeline__segment--box {
      width: 12px !important;
    }
  }

  &__labels-col {
    flex: 1;
    position: relative;
  }

  &__label {
    position: absolute;
    left: var(--space-s);
    right: 0;
    transform: translateY(-50%);
    display: flex;
    gap: var(--space-xs);
    align-items: baseline;
    background: none;
    border: none;
    padding: 3px var(--space-xs);
    cursor: pointer;
    text-align: left;
    border-radius: var(--border-radius-s);
    font-family: inherit;
    transition: background-color var(--transition);

    &:hover {
      background: var(--color-bg-raised);
    }

    &-date {
      font-size: var(--font-size-xs);
      color: var(--color-text);
      white-space: nowrap;
    }

    &-count {
      font-size: var(--font-size-xxs);
      color: var(--color-text-light);
      white-space: nowrap;
    }

    &--offtopic &-date {
      color: var(--color-text-yellow);
    }
  }

  &__anchor {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    user-select: none;
    pointer-events: none;
    line-height: 1;
    text-align: center;
    width: 40px;
    flex-shrink: 0;
    padding: var(--space-s) 0;
  }
}

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

  &__jump-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--color-text-lighter);
    opacity: 0.35;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      opacity var(--transition),
      color var(--transition);

    &:hover {
      opacity: 1;
      color: var(--color-accent);
    }
  }

  &__inner {
    // Sticky so the scrubber floats in the viewport while the user scrolls.
    // Vertically centered: top at 20vh, height 60vh → sits at 20-80% of viewport.
    // max-height: 100% ensures it never overflows the absolute outer container
    // on short discussions where the discussion is less than 80vh tall.
    position: sticky;
    top: 20vh;
    height: 60vh;
    max-height: 100%;
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
    // writing-mode: vertical-rl alone reads top-to-bottom naturally.
    transform: rotate(0deg);

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

    // End label matches start - both read top-to-bottom with vertical-rl.
    &--end {
      transform: rotate(0deg);
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
    cursor: default;

    &--loading {
      opacity: 0.4;
      pointer-events: none;
    }

    &--over-segment {
      cursor: pointer;
    }
  }

  &__segment {
    position: absolute;
    left: 50%;
    background-color: var(--color-accent);
    pointer-events: all;
    cursor: pointer;
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

    // Off-topic overlay: slightly wider so it's visible even when overlapping
    // a normal segment, and uses the warning color token.
    &--offtopic {
      background-color: var(--color-text-yellow);
      width: 4px;
      z-index: 2;
    }
  }

  &__bar {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    background-color: var(--color-border);
    border-radius: var(--border-radius-l);
    pointer-events: none;
    transition:
      background-color var(--transition),
      width var(--transition-fast);

    &--gap {
      background-color: transparent;
      background-image: repeating-linear-gradient(
        to bottom,
        var(--color-border) 0px,
        var(--color-border) 3px,
        transparent 3px,
        transparent 7px
      );
      border-radius: 0;
    }
  }

  &__track:hover &__bar:not(.discussion-timeline__bar--gap) {
    background-color: var(--color-border-strong);
    width: 3px;
  }

  &__track:hover &__bar--gap {
    background-image: repeating-linear-gradient(
      to bottom,
      var(--color-border-strong) 0px,
      var(--color-border-strong) 3px,
      transparent 3px,
      transparent 7px
    );
  }

  &__position {
    // "You are here" line - a horizontal rule across the track
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 14px;
    height: 3px;
    background-color: var(--color-accent);
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
    // Appears to the RIGHT of the track. left: 100% = left edge past the 20px track,
    // then an extra gap, then the tooltip box.
    position: absolute;
    left: calc(100% + var(--space-xs));
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
    display: flex;
    flex-direction: column;
    gap: 1px;

    &-date {
      color: var(--color-text);
    }

    &-count {
      color: var(--color-text-light);
    }
  }
}
</style>
