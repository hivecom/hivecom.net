<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Marquee } from '@dolanske/vui'
import constants from '~~/constants.json'
import EventSmall from '@/components/Events/EventSmall.vue'
import LandingHero from '@/components/Landing/LandingHero.vue'
import LandingSun from '@/components/Landing/LandingSun.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'

}>()

// Fetch the latest 6 forum posts and their title & description
const supabase = useSupabaseClient()
const maruqeeItems = ref<{ id: number, title: string, description: string | null }[]>([])

const MARQUEE_SPEED = 20

const events = ref<Tables<'events'>[]>([])

onBeforeMount(() => {
  supabase.from('discussions')
    .select('id, title, description')
    .eq('is_draft', false)
    .not('discussion_topic_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)
    .then(({ data }) => {
      if (data) {
        maruqeeItems.value = data
      }
    })

  // Get the 3 most upcoming events
  supabase.from('events')
    .select('*')
    .eq('is_official', true)
    .order('date', { ascending: false })
    .limit(3)
    .then(({ data }) => {
      if (data) {
        events.value = data
      }
    })
})

// About card flips between the "about us" story and our mantra. Clicking the
// barcode glitch-swaps the copy in place, same letter-jitter feel as LandingMotd.
const BAR_ABOUT = '1011010011101011010100110101101011010010'
const BAR_MANTRA = '1101001101011001011010011010110100110101'

const SIDES = [
  {
    corner: '##########',
    heading: 'About us',
    barcode: BAR_ABOUT,
    lines: [
      { text: 'Hivecom started back in 2013 as a few friends who just wanted a reliable place to hang out and talk.' },
      { text: 'We ran our first server on an in-home Raspberry Pi. The growing demand for a better connection and 24/7 uptime pushed us onto a dedicated server, and eventually onto infrastructure we run and manage entirely ourselves.' },
      { text: 'It has come a long way since, and it wouldn\'t be anything without the people who make it what it is. We\'re incredibly thankful for what we have now, considering it all started with a few friends getting together to chat and hang out.' },
      { text: 'We are always happy to welcome anyone willing to join us for this journey.', strong: true },
    ],
  },
  {
    corner: '//////////',
    heading: 'Our mantra',
    barcode: BAR_MANTRA,
    lines: [
      { text: 'We run on a non-profit basis. Every donation goes back into server hosting and our projects, nothing else.' },
      { text: 'We aim to know as little about you as possible, and we will never sell out to a larger entity that would change that.' },
      { text: 'What you make stays yours. We don\'t claim it, sell it, or profit from it.' },
      { text: 'Non-profit, open source, built for anyone and everyone.', strong: true },
    ],
  },
]

const sideIndex = ref(0)
const aboutPhase = ref<'idle' | 'out' | 'in'>('idle')
const side = computed(() => SIDES[sideIndex.value] ?? SIDES[0]!)
const isAbout = computed(() => sideIndex.value === 0)

const ABOUT_OUT_MS = 260
const ABOUT_IN_MS = 320

// Runs of set bits become bars, so the pattern string maps straight to an SVG.
const barcodeBars = computed(() => {
  const pattern = side.value.barcode
  const bars: { x: number, w: number }[] = []
  let x = 0
  while (x < pattern.length) {
    if (pattern[x] === '1') {
      let w = 1
      while (pattern[x + w] === '1')
        w++
      bars.push({ x, w })
      x += w
    }
    else {
      x++
    }
  }
  return bars
})

let aboutBusy = false

function aboutReducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  }
  catch {
    return false
  }
}

function aboutSleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function toggleSide() {
  if (aboutBusy)
    return
  aboutBusy = true

  const reduce = aboutReducedMotion()

  if (!reduce) {
    aboutPhase.value = 'out'
    await aboutSleep(ABOUT_OUT_MS)
  }

  sideIndex.value = sideIndex.value === 0 ? 1 : 0

  if (!reduce) {
    aboutPhase.value = 'in'
    await aboutSleep(ABOUT_IN_MS)
    aboutPhase.value = 'idle'
  }

  aboutBusy = false
}
</script>

<template>
  <div class="home-page">
    <!-- TODO: needs to be decoupled -->
    <!-- When peeking from the dashboard, skip the initial splash fade - the page
         already animates up into view, so replaying the 3s splash reads as a stall. -->
      <template #after-stats>
    </LandingHero>

    <GlowGroup>
      <div class="container-m">
        <section id="hero" class="hero">
          <GlowCard class="glow-card-home">
            <div class="home-card centered home-card--about typeset ">
              <span class="corner-text">{{ side.corner }}</span>
              <span class="corner-text right">DLN // ZLS</span>

              <!-- Both sides are always rendered and stacked in one grid cell, so the
                   card is always as tall as the taller side and the layout never shifts. -->
              <div class="about-stack">
                <div
                  v-for="(entry, entryIndex) in SIDES"
                  :key="entryIndex"
                  class="about-swap"
                  :class="{
                    'about-swap--active': entryIndex === sideIndex,
                    'about-swap--out': entryIndex === sideIndex && aboutPhase === 'out',
                    'about-swap--in': entryIndex === sideIndex && aboutPhase === 'in',
                  }"
                  :aria-hidden="entryIndex !== sideIndex"
                >
                  <h2>{{ entry.heading }}</h2>
                  <p v-for="(line, index) in entry.lines" :key="index">
                    <b v-if="line.strong">{{ line.text }}</b>
                    <template v-else>
                      {{ line.text }}
                    </template>
                  </p>
                </div>
              </div>

              <button
                type="button"
                class="about-barcode"
                :aria-label="isAbout ? 'Show our mantra' : 'Show about us'"
                @click="toggleSide"
              >
                <svg :viewBox="`0 0 ${side.barcode.length} 12`" :width="side.barcode.length" height="12" aria-hidden="true">
                  <rect v-for="bar in barcodeBars" :key="bar.x" :x="bar.x" y="0" :width="bar.w" height="12" />
                </svg>
              </button>
            </div>
          </GlowCard>
        </section>
      </div>

      <div class="container-m ">
        <section class="home-events">
          <EventSmall v-for="event in events" :key="event.id" :data="event" :no-glow="false" class="glow-card-home" />
          <div class="card-pointer top-right" data-text="Upcoming events" />
          <div class="card-pointer bottom-left" data-text="What we're up to" />
        </section>
      </div>

      <section class="">
        <div class="container-m">
          <div class="relative">
            <GlowCard class="glow-card-home">
              <div class="home-card home-card--forum">
                <Marquee :speed="MARQUEE_SPEED" direction="left">
                  <p>
                    <NuxtLink to="/forum">
                      LATEST FORUM POSTS LATEST FORUM POSTS LATEST FORUM POSTS
                    </NuxtLink>
                  </p>
                </Marquee>
                <Marquee
                  v-for="(item, index) in maruqeeItems" :key="item.id" :speed="MARQUEE_SPEED"
                  :direction="index % 2 === 0 ? 'right' : 'left'"
                >
                  <p>
                    <NuxtLink :to="`/forum/${item.id}`">
                      {{ item.title }}{{ item.description ? `: ${item.description}` : '' }}
                    </NuxtLink>
                  </p>
                </Marquee>
              </div>
            </GlowCard>
            <div class="card-pointer bottom-right" data-text="Forum" />
          </div>
        </div>
      </section>
    </GlowGroup>
    <div class="home-join">
      <LandingSun class="home-join__sun" />
      <div class="container-s">
        <h2>Join us</h2>
        <p>
          Join us but also dont have to but it’d be cool if you did just thinkig about it, ok i'll sit down for a sec don't
          let me disturb you just ponder on it for a second.
        </p>
        <NuxtLink to="/auth/sign-up" class="join-button">
          Sign Up
        </NuxtLink>

        <p>Or you can visit...</p>
      </div>

      <div class="constellation">
        <a v-for="link in constants.LINKS" :key="link.name" target="_blank" rel="noreferer noopener" :href="link.url">
          {{ link.name }}
        </a>

        <svg class="desktop-constellation" width="857" height="112" viewBox="0 0 857 112" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M34.624 100.214L237.624 66.214M274.707 61.7071L456.707 53.2192M498.707 50.2071L669.207 11.2955M710.99 11.2955L829.707 83.7071M0.707031 102.192L9.19231 93.7071L17.6776 102.192L9.19231 110.678L0.707031 102.192ZM838.707 92.1924L847.192 83.7071L855.678 92.1924L847.192 100.678L838.707 92.1924ZM247.707 63.1924L256.192 54.7071L264.678 63.1924L256.192 71.6777L247.707 63.1924ZM684.707 9.19239L693.192 0.707108L701.678 9.19239L693.192 17.6777L684.707 9.19239ZM468.707 52.1924L477.192 43.7071L485.678 52.1924L477.192 60.6777L468.707 52.1924Z" stroke="white" stroke-opacity="0.25" stroke-dasharray="2 2" />
        </svg>

        <svg class="mobile-constellation" width="265" height="339" viewBox="0 0 265 339" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M29.707 86.707L11.707 26.707M83.707 162.707L49.707 120.707M153.707 211.707L112.707 187.707M242.707 314.707L183.707 236.707M0.707031 9.19231L9.19231 0.707031L17.6776 9.19231L9.19231 17.6776L0.707031 9.19231ZM29.707 106.192L38.1923 97.707L46.6776 106.192L38.1923 114.678L29.707 106.192ZM87.707 176.192L96.1923 167.707L104.678 176.192L96.1923 184.678L87.707 176.192ZM160.707 222.192L169.192 213.707L177.678 222.192L169.192 230.678L160.707 222.192ZM246.707 329.192L255.192 320.707L263.678 329.192L255.192 337.678L246.707 329.192Z" stroke="white" stroke-opacity="0.5" stroke-dasharray="2 2" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins' as *;

.glow-card-home {
  corner-shape: squircle;
  border-radius: var(--border-radius-l);

  // In case it's nested like in EventSmall
  :deep(.glow-card) {
    corner-shape: squircle;
    border-radius: var(--border-radius-l);
  }
}

.card-pointer {
  position: absolute;
  width: 317px;
  height: 99px;

  &:after {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background-image: url("data:image/svg+xml,%3Csvg width='317' height='99' viewBox='0 0 317 99' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M298.353 5.70707H93.3525L0.352539 97.9556M305.352 5.70709L310.352 10.7071L315.352 5.70709L310.352 0.707092L305.352 5.70709Z' stroke='%23282828'/%3E%3C/svg%3E");
  }

  &:before {
    content: attr(data-text);
    position: absolute;
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
    font-size: var(--font-size-m);
    text-transform: uppercase;
    color: var(--color-text-lightest);
    line-height: 16px;
    height: 16px;
  }

  &.top-right {
    left: 100%;
    bottom: 100%;

    &:before {
      transform-origin: top left;
      right: 0;
      transform: translateX(100%) translateY(50%) rotate(90deg);
      top: 16px;
    }
  }

  &.bottom-left {
    top: 100%;
    right: 100%;

    &:after {
      transform: scale(-1);
    }

    &:before {
      transform-origin: bottom left;
      left: 0;
      transform: translateX(14px) rotate(-90deg);
      bottom: 24px;
    }
  }

  &.bottom-right {
    top: 100%;
    left: 100%;

    &:after {
      transform: scaleY(-1);
    }

    &:before {
      transform-origin: bottom right;
      right: 0;
      transform: translateX(-14px) rotate(90deg);
      bottom: 24px;
    }
  }
}

.home-page {
  display: flex !important;
  flex-direction: column;
  gap: 128px;
  width: 100%;
  // Sit above the persistent page backdrop (HomeBackdrop, z-index 0).
  position: relative;
  z-index: 1;

  * {
    user-select: none;
  }

  @media screen and (max-width: $breakpoint-m) {
    gap: var(--space-xxxl);
  }
}

.home-join {
  text-align: center;
  word-wrap: balanced;
  width: 100%;
  position: relative;
  overflow: hidden;
  padding-bottom: 420px;

  // The sun band sits behind the join content and crests the bottom edge.
  .home-join__sun {
    position: absolute;
    left: 0;
    bottom: -80px;
    width: 100%;
    height: 760px;
    z-index: 0;
  }

  @media screen and (max-width: $breakpoint-m) {
    .home-join__sun {
      bottom: 0;
    }
  }

  h2 {
    margin-bottom: var(--space-m);
  }

  p {
    margin-bottom: var(--space-xl);

    &:last-child {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
      margin-top: var(--space-m);
    }
  }

  .join-button {
    display: flex;
    height: 40px;
    justify-content: center;
    align-items: center;
    border-radius: var(--border-radius-pill);
    background-color: var(--color-text);
    color: var(--color-text-invert);
    width: min(100%, 324px);
    margin: auto;
    font-weight: var(--font-weight-semibold);
    transition: background-color var(--transition-fast);

    &:hover {
      background-color: var(--color-accent);
    }
  }

  .container-s {
    --container-s: 472px;
    position: relative;
    z-index: 1;
  }

  .constellation {
    display: inline-block;
    margin: auto;
    position: relative;
    z-index: 1;
    margin-top: 164px;

    .mobile-constellation {
      display: none;
    }

    @media screen and (max-width: $breakpoint-m) {
      padding-bottom: 128px;
      margin-top: 96px;

      .desktop-constellation {
        display: none;
      }

      .mobile-constellation {
        display: block;
      }

      a {
        padding-bottom: var(--space-l) !important;
        padding-left: 56px !important;

        // Media query for some reason does not override default styles here
        &:nth-child(1) {
          top: -4.8% !important;
          left: -7.2% !important;
        }

        &:nth-child(2) {
          top: 15% !important;
          left: 3.3% !important;
        }

        &:nth-child(3) {
          top: 28% !important;
          left: 25% !important;
          white-space: nowrap;
          padding-top: var(--space-l) !important;
        }

        &:nth-child(4) {
          top: 38% !important;
          left: 51.4% !important;
        }

        &:nth-child(5) {
          top: 67% !important;
          left: 59% !important;
          padding-right: 56px !important;
          padding-left: var(--space-l) !important;
        }
      }
    }

    a {
      display: block;
      position: absolute;
      padding: var(--space-l);
      padding-bottom: 56px;
      color: var(--color-text);
      background-color: transparent;
      transform-origin: center center;
      text-transform: uppercase;
      font-size: var(--font-size-s);
      text-align: center;

      &:hover {
        color: var(--color-accent);
      }

      &:nth-child(1) {
        top: 34%;
        left: -5.2%;
      }

      &:nth-child(2) {
        top: 5%;
        left: 24.3%;
      }

      &:nth-child(3) {
        top: 20%;
        left: 47%;
        padding: var(--space-l);
        padding-bottom: var(--space-l);
        padding-top: 56px;
      }

      &:nth-child(4) {
        top: -45%;
        left: 75.4%;
      }

      &:nth-child(5) {
        top: 80%;
        left: 93%;
      }
    }
  }
}

.home-events {
  display: grid;
  grid-template-columns: 3fr 2fr;
  grid-template: 'main sideA' 'main sideB';
  gap: var(--space-m);
  z-index: 2;
  position: relative;

  @media screen and (max-width: $breakpoint-s) {
    grid-template-columns: 1fr;
    grid-template: 'main' 'sideA' 'sideB';
  }

  &:hover a {
    background-color: var(--color-bg-medium);
  }

  a {
    position: relative;
    background-color: color-mix(in srgb, var(--color-bg-medium) 85%, transparent);
    transition: background-color var(--transition-slow);

    &:before {
      content: '';
      position: absolute;
      inset: 0;
      background-color: var(--color-bg-card);
      border-radius: var(--border-radius-l);
      z-index: -1;
      opacity: 0.85;
    }

    &:nth-child(1) {
      grid-area: main;

      :deep(.event-small) {
        .event-date {
          font-size: var(--font-size-l);
        }

        .event-title {
          font-size: var(--font-size-xxxl);
          margin-bottom: var(--space-s);
        }

        .event-description {
          font-size: var(--font-size-l);
          @include line-clamp(5);
          margin-bottom: var(--space-m);
          flex: unset;
        }
      }
    }

    &:nth-child(2) {
      grid-area: sideA;
    }

    &:nth-child(3) {
      grid-area: sideB;
    }

    :deep(.event-small) {
      position: relative;
      corner-shape: squircle;
      border-radius: var(--border-radius-l);
      --vui-card-background-color: transparent;
    }
  }
}

.home-card {
  border-radius: var(--border-radius-l);
  border: 1px solid var(--color-border);
  corner-shape: squircle;
  padding: var(--space-l);
  z-index: 2;
  position: relative;

  &.centered {
    text-align: center;
  }

  &:before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: var(--color-bg-card);
    border-radius: var(--border-radius-l);
    z-index: -1;
    opacity: 0.85;
  }

  h2 {
    font-size: var(--font-size-xxxl);
    margin-bottom: var(--space-xl);
    text-transform: uppercase;
  }

  p {
    color: var(--color-text-light);
    text-wrap: balance;
    font-size: var(--font-size-m);

    b {
      color: var(--color-text);
    }
  }
}

.home-card--about {
  padding-inline: var(--space-xxxl);
  padding-top: 96px;
  padding-bottom: 128px;
  position: relative;

  @media screen and (max-width: $breakpoint-m) {
    padding: 64px 32px;
  }

  .corner-text {
    position: absolute;
    top: 16px;
    left: 16px;
    font-size: var(--font-size-s);
    color: var(--color-text-lightest);
    text-transform: uppercase;
    font-weight: var(--font-weight-semibold);

    &.right {
      left: unset;
      right: 16px;
    }
  }

  p {
    font-size: 1.6rem;
  }

  .about-barcode {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: var(--space-s);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 0;
    color: var(--color-accent);
    transition: opacity var(--transition-fast);

    rect {
      fill: currentColor;
    }

    &:hover {
      opacity: 0.7;
    }

    &:focus-visible {
      outline: 1px solid var(--color-accent);
      outline-offset: 4px;
    }
  }
}

// Both sides live in one grid cell, so the card height is the taller of the two
// and never shifts when swapping. Only the active side is visible.
.about-stack {
  display: grid;
}

// Glitch swap between the about and mantra copy. Each line jitters out then the
// new line jitters back in, staggered top to bottom for the "almost glitching" feel.
.about-swap {
  grid-area: 1 / 1;
  opacity: 0;
  pointer-events: none;

  &--active {
    opacity: 1;
    pointer-events: auto;
  }

  > * {
    will-change: opacity, transform, clip-path;
  }

  &--out > * {
    animation: about-glitch-out 260ms cubic-bezier(0.65, 0, 0.35, 1) both;
  }

  &--in > * {
    animation: about-glitch-in 320ms cubic-bezier(0.65, 0, 0.35, 1) both;
  }

  &--out > :nth-child(2),
  &--in > :nth-child(2) {
    animation-delay: 40ms;
  }

  &--out > :nth-child(3),
  &--in > :nth-child(3) {
    animation-delay: 80ms;
  }

  &--out > :nth-child(4),
  &--in > :nth-child(4) {
    animation-delay: 120ms;
  }

  &--out > :nth-child(5),
  &--in > :nth-child(5) {
    animation-delay: 160ms;
  }
}

@keyframes about-glitch-out {
  0% {
    opacity: 1;
    transform: translateX(0);
    clip-path: inset(0 0 0 0);
  }
  25% {
    transform: translateX(-3px) skewX(-3deg);
    clip-path: inset(0 0 45% 0);
  }
  50% {
    transform: translateX(4px);
    clip-path: inset(55% 0 0 0);
  }
  100% {
    opacity: 0;
    transform: translateX(-4px);
  }
}

@keyframes about-glitch-in {
  0% {
    opacity: 0;
    transform: translateX(5px);
  }
  30% {
    opacity: 1;
    transform: translateX(-3px) skewX(2deg);
    clip-path: inset(45% 0 0 0);
  }
  60% {
    transform: translateX(2px);
    clip-path: inset(0 0 35% 0);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
    clip-path: inset(0 0 0 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .about-swap--out > *,
  .about-swap--in > * {
    animation: none !important;
  }
}

.home-card--forum {
  overflow: hidden;
  display: grid;
  grid-template-rows: repeat(6, 64px);
  gap: 0;

  p {
    font-size: 64px;
    line-height: 64px;
    color: var(--color-text-light);
    text-transform: uppercase;
    font-weight: var(--font-weight-bold);
    cursor: default;

    a {
      text-decoration: none;
      color: inherit;

      &:hover {
        color: var(--color-accent);
      }
    }
  }
}

// Hero related styling
.hero {
  // TODO: add parallax
  &:after {
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 255, 255, 0.75) 0%,
      rgba(255, 255, 255, 0.7) 32%,
      rgba(255, 255, 255, 0.55) 55%,
      rgba(255, 255, 255, 0.35) 70%,
      transparent 82%
    );
  }

  .hero-shader {
    opacity: 0.5;
    z-index: -1;
  }
}
</style>
