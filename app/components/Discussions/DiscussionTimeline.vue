<script setup lang="ts">
import { Button, Calendar, Flex, Modal } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { displayDateTime, fullDate, fullDateTime } from '@/lib/utils/date'

export interface TimelineBucket {
  bucketStart: string
  replyCount: number
}

interface Props {
  /** ISO timestamp */
  start: string

  /** ISO timestamp of the last activity */
  end: string

  /** From get_discussion_reply_activity_buckets */
  buckets?: TimelineBucket[]

  /** Drawn as a second layer in the warning color */
  offtopicBuckets?: TimelineBucket[]

  offtopicHidden?: boolean

  /** Unloaded range, drawn dashed so users see what they'd skip */
  gapRange?: { start: string, end: string } | null

  /** Expected spacing between buckets. Wider gaps mean silence between active periods. */
  bucketIntervalMs?: number

  /** Scroll position in the reply area, 0-1 */
  currentFraction?: number | null

  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  buckets: () => [],
  offtopicBuckets: () => [],
  offtopicHidden: false,
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
  /** 0-1 along the track */
  topFraction: number

  /** Equals topFraction for a dot */
  bottomFraction: number

  maxCount: number

  /** A single isolated bucket, drawn as a dot */
  isSingle: boolean

  label: string

  /** 0.25 when quiet, 1 at peak */
  opacity: number

  /** Where a click navigates: the start of the segment's first bucket. */
  targetDate: Date
}

// Buckets up to 1.5x the interval apart count as consecutive (DST jitter).
// Isolated buckets become dots and runs become boxes.
function buildSegments(buckets: TimelineBucket[], max: number, clampLastToEnd = true): BucketSegment[] {
  if (buckets.length === 0)
    return []

  const intervalMs = props.bucketIntervalMs

  const segments: BucketSegment[] = []
  let runStart = 0
  let runMaxCount = buckets[0]!.replyCount
  let runTotalCount = buckets[0]!.replyCount
  let runLength = 1

  function flushRun(endIdx: number, isFinal = false) {
    const first = buckets[runStart]!
    const last = buckets[endIdx]!
    const isSingle = runLength === 1
    const bucketFraction = intervalMs > 0 ? intervalMs / spanMs.value : 0
    const topFraction = isSingle && isFinal && clampLastToEnd ? 1 : toFraction(first.bucketStart)
    const bottomFraction = isFinal && clampLastToEnd
      ? 1
      : isSingle
        ? topFraction
        : Math.min(1, toFraction(last.bucketStart) + bucketFraction)

    const label = isSingle
      ? `${runMaxCount} ${runMaxCount === 1 ? 'reply' : 'replies'}`
      : `${runTotalCount} ${runTotalCount === 1 ? 'reply' : 'replies'} (${runLength} ${intervalMs >= 86400000 ? 'days' : 'periods'})`

    // The bucket start, since navigateToDate runs with findFirst: true (first
    // reply at or after the target). The click lands on the segment's first reply.
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
  flushRun(buckets.length - 1, true)

  return segments.map(s => ({
    ...s,
    opacity: 0.25 + (s.maxCount / (max || 1)) * 0.75,
  }))
}

const bucketSegments = computed((): BucketSegment[] => {
  return buildSegments(props.buckets, maxBucketCount.value)
})

const offtopicSegments = computed((): BucketSegment[] => {
  return buildSegments(props.offtopicBuckets, maxOfftopicBucketCount.value, false)
})

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

function nearestSegment(): BucketSegment | null {
  const allSegs = [...offtopicSegments.value, ...bucketSegments.value]
  if (!allSegs.length)
    return null

  const f = hoverFraction.value
  let best: BucketSegment | null = null
  let bestDist = Infinity
  for (const seg of allSegs) {
    const dist = seg.isSingle
      ? Math.abs(f - seg.topFraction)
      : Math.max(0, seg.topFraction - f, f - seg.bottomFraction)
    if (dist < bestDist) {
      bestDist = dist
      best = seg
    }
  }
  return best
}

const hoveredSegment = computed((): BucketSegment | null => {
  if (!isHovering.value)
    return null

  const f = hoverFraction.value

  // Makes the track clickable near a dot, not just on the 6px dot itself
  const DOT_THRESHOLD = 0.05

  // The off-topic layer renders on top
  for (const seg of offtopicSegments.value) {
    if (seg.isSingle) {
      if (Math.abs(f - seg.topFraction) <= DOT_THRESHOLD)
        return seg
    }
    else {
      if (f >= seg.topFraction && f <= seg.bottomFraction)
        return seg
    }
  }

  for (const seg of bucketSegments.value) {
    if (seg.isSingle) {
      if (Math.abs(f - seg.topFraction) <= DOT_THRESHOLD)
        return seg
    }
    else {
      if (f >= seg.topFraction && f <= seg.bottomFraction)
        return seg
    }
  }
  return null
})

function onTrackClick() {
  if (props.loading)
    return

  const seg = hoveredSegment.value ?? nearestSegment()
  if (seg)
    onSegmentClick(seg)
}

function onSegmentClick(seg: BucketSegment) {
  if (props.loading)
    return

  // Clicking the middle of a box navigates to the middle of its time range
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

// "Mar 26": month and day, since "Mar '26" twice can't tell two dates apart.
// Hourly buckets show the time too.
function formatLabel(isoDate: string): string {
  const d = new Date(isoDate)
  if (props.bucketIntervalMs <= 60 * 60 * 1000)
    return displayDateTime(d)

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
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
  if (props.bucketIntervalMs <= 60 * 60 * 1000)
    return fullDateTime(date)

  return fullDate(date)
}

/** Any click finds the nearest segment */
const isOverSegment = computed(() => isHovering.value)

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
  <div class="discussion-timeline" aria-hidden="true">
    <div class="discussion-timeline__inner">
      <button
        class="discussion-timeline__jump-btn"
        title="Jump to date"
        :disabled="loading"
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
        @click="onTrackClick"
      >
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
        <div class="discussion-timeline__segment discussion-timeline__segment--dot" style="top: 0%; opacity: 1; cursor: pointer;" @click="navigateToStart" />
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
        />

        <!-- Hidden off-topic runs show as dots only, hinting position without extent -->
        <template v-for="(seg, i) in offtopicSegments" :key="`offtopic-${i}`">
          <div
            class="discussion-timeline__segment discussion-timeline__segment--offtopic"
            :class="(seg.isSingle || offtopicHidden) ? 'discussion-timeline__segment--dot' : 'discussion-timeline__segment--box'"
            :style="{
              top: `${seg.topFraction * 100}%`,
              height: (!seg.isSingle && !offtopicHidden) ? `${(seg.bottomFraction - seg.topFraction) * 100}%` : undefined,
              opacity: seg.opacity,
            }"
          />
        </template>

        <div
          v-if="currentFraction != null"
          class="discussion-timeline__position"
          :style="{ top: `${currentFraction * 100}%` }"
        />

        <div
          v-show="isHovering && !loading"
          class="discussion-timeline__dot"
          :style="{ top: `${hoverFraction * 100}%` }"
        />

        <div
          v-show="isHovering && !loading"
          class="discussion-timeline__tooltip"
          :style="{ top: `${hoverFraction * 100}%` }"
        >
          <template v-for="(line, i) in tooltipText.split('\n')" :key="i">
            <span :class="i === 0 ? 'block' : 'text-color-lighter block'">{{ line }}</span>
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

      <button
        class="discussion-timeline__jump-btn"
        title="Navigate to end"
        :disabled="loading"
        @click="navigateToEnd"
      >
        <Icon name="ph:arrow-down" size="12" />
      </button>
    </div>
  </div>

  <!-- Outside the aria-hidden wrapper -->
  <Modal
    :open="showJumpModal"
    :size="isMobile ? 'screen' : 'm'"
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
              <template #start>
                <Icon name="ph:calendar" />
              </template>
              {{ jumpDate ? jumpDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }) : 'Pick a date' }}
            </Button>
          </template>
        </Calendar>
      </Flex>
    </template>

    <Flex column gap="l" class="timeline-jump-modal">
      <div class="timeline-jump-modal__track-area">
        <span class="timeline-jump-modal__anchor">{{ formatLabel(start) }}</span>

        <!-- Track and label columns share one height -->
        <div class="timeline-jump-modal__inner-row">
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
              <template v-if="!offtopicHidden">
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
              </template>

              <div
                v-if="currentFraction != null"
                class="discussion-timeline__position"
                :style="{ top: `${currentFraction * 100}%` }"
              />
            </div>
          </div>

          <div class="timeline-jump-modal__labels-col">
            <button
              v-for="(seg, i) in bucketSegments"
              :key="`mjl-${i}`"
              class="timeline-jump-modal__label"
              :style="{ top: `${((seg.topFraction + seg.bottomFraction) / 2) * 100}%` }"
              @click="handleModalSegmentClick(seg)"
            >
              <span>{{ formatTooltip(seg.targetDate) }}</span>
              <span>{{ seg.label }}</span>
            </button>
            <button
              v-for="(seg, i) in offtopicSegments"
              :key="`mjlo-${i}`"
              class="timeline-jump-modal__label timeline-jump-modal__label--offtopic"
              :style="{ top: `${((seg.topFraction + seg.bottomFraction) / 2) * 100}%` }"
              @click="handleModalSegmentClick(seg)"
            >
              <span>{{ formatTooltip(seg.targetDate) }}</span>
              <span>{{ seg.label }}</span>
            </button>
          </div>
        </div>

        <span class="timeline-jump-modal__anchor">{{ formatLabel(end) }}</span>
      </div>
    </Flex>
  </Modal>
</template>

<style scoped lang="scss">
.timeline-jump-modal {
  height: 100%;

  &__track-area {
    display: flex;
    flex-direction: column;
    // max-width: 560px;
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
    color: var(--color-text);
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
  // Sits in the dead zone past the container's right wall, relative to .discussion
  position: absolute;
  left: calc(100% + var(--space-m));
  top: 0;
  bottom: 0;
  width: 24px;
  // The inner element re-enables pointer events
  pointer-events: none;

  // No dead zone to live in below this width
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
    transform: translateX(-1px);
    transition:
      opacity var(--transition),
      color var(--transition);

    &:hover:not(:disabled) {
      opacity: 1;

      :deep(.iconify) {
        color: var(--color-accent) !important;
      }
    }

    &:disabled {
      cursor: default;
    }
  }

  &__inner {
    // max-height keeps it inside the outer container on discussions shorter than 80vh
    position: sticky;
    top: 20vh;
    height: 60vh;
    max-height: 100%;
    pointer-events: all;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
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
    writing-mode: vertical-rl;
    transform: rotate(0deg);

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

    &--end {
      transform: rotate(0deg);
    }
  }

  &__inner:hover &__label {
    opacity: 0.85;
  }

  &__track {
    flex: 1;
    // Transparent hit area so the 2px bar is clickable
    width: 20px;
    background: transparent;
    position: relative;
    cursor: default;
    transform: translateX(-1px);

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

    // Isolated bucket
    &--dot {
      width: 6px;
      height: 6px;
      border-radius: var(--border-radius-pill);
      transform: translate(-50%, -50%);
    }

    &--box {
      width: 6px;
      border-radius: var(--border-radius-xs);
      transform: translateX(-50%);
      min-height: 6px;
    }

    // Off-topic overlay, drawn above normal segments in the warning color.
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
    // width: 3px;
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
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    border-radius: var(--border-radius-pill);
    background-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-bg);
    pointer-events: none;
    z-index: 2;
  }

  &__tooltip {
    position: absolute;
    left: calc(100% + var(--space-xs));
    transform: translateY(-50%);
    white-space: nowrap;
    background-color: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    padding: var(--space-xs);
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
