<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AtypeName } from '@/lib/atype.generated'
import type { Tables } from '@/types/database.types'
import { Marquee, pushToast } from '@dolanske/vui'
import constants from '~~/constants.json'
import EventSmall from '@/components/Events/EventSmall.vue'
import LandingHero from '@/components/Landing/LandingHero.vue'
import LandingSun from '@/components/Landing/LandingSun.vue'
import AtypeText from '@/components/Shared/AtypeText.vue'
import FocusFrame from '@/components/Shared/FocusFrame.vue'
import FocusTarget from '@/components/Shared/FocusTarget.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'

// Fetch the latest 6 forum posts and their title & description
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const nuxtApp = useNuxtApp()
const runtimeConfig = useRuntimeConfig()
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

// The closing section pitches signing up, which is nothing to someone who
// already has an account. Members get the invite angle instead.
//
// `/` is prerendered with no session, so reading `user` on the hydrating render
// would swap the copy out from under the server's markup. Hold the guest branch
// for that one frame. A logged-in user only reaches the landing by way of the
// Home tab anyway, which is a fresh mount well past hydration.
//
// `isHydrating` is client-only, so the server needs saying explicitly. Prod
// prerenders with no session and lands on the guest branch by itself, but a dev
// request carries the auth cookie and would render the member branch server-side,
// which the client's hydrating render then contradicts. Same pin as index.vue.
const hydrating = ref(import.meta.server || nuxtApp.isHydrating)

onMounted(() => {
  hydrating.value = false
})

const isMember = computed(() => !hydrating.value && !!user.value)

// Straight to sign-up rather than the landing, so whoever gets this link lands
// on the form instead of having to find it.
const signUpLink = computed(() => {
  const baseUrl = (runtimeConfig.public.baseUrl as string) || 'https://hivecom.net'

  return new URL('/auth/sign-up', baseUrl).toString()
})

async function copySignUpLink() {
  try {
    await navigator.clipboard.writeText(signUpLink.value)
    pushToast('Sign-up link copied', { description: signUpLink.value, timeout: 3000 })
  }
  catch {
    pushToast('Could not copy to clipboard', { description: signUpLink.value })
  }
}

// About card flips between the "about us" story and our mantra. Clicking the
// barcode glitch-swaps the copy in place, same letter-jitter feel as LandingMotd.
// The corners and barcode are pre-rendered hidden messages from app/lib/atype.generated.ts.
interface AboutSide {
  corner: AtypeName
  cornerRight: AtypeName
  heading: string
  barcode: AtypeName
  lines: { text: string, strong?: boolean }[]
}

const SIDES: AboutSide[] = [
  {
    corner: 'cornerAbout',
    cornerRight: 'cornerRightAbout',
    heading: 'About us',
    barcode: 'barcodeAbout',
    lines: [
      { text: 'Hivecom started back in 2013 as a few friends who just wanted a reliable place to hang out and talk.' },
      { text: 'We ran our first server on an in-home Raspberry Pi. The growing demand for a better connection and 24/7 uptime pushed us onto a dedicated server, and eventually onto infrastructure we run and manage entirely ourselves.' },
      { text: 'It has come a long way since, and it wouldn\'t be anything without the people who make it what it is. We\'re incredibly thankful for what we have now, considering it all started with a few friends getting together to chat and hang out.' },
      { text: 'We are always happy to welcome anyone willing to join us for this journey.', strong: true },
    ],
  },
  {
    corner: 'cornerMantra',
    cornerRight: 'cornerRightMantra',
    heading: 'Our mantra',
    barcode: 'barcodeMantra',
    lines: [
      { text: 'We run on a non-profit basis. Every donation goes back into server hosting and our projects, nothing else.' },
      { text: 'We aim to know as little about you as possible, and we will never sell out to a larger entity that would change that.' },
      { text: 'What you make stays yours. We don\'t claim it, sell it, or profit from it.' },
      { text: 'Non-profit, open source, built for anyone and everyone.', strong: true },
    ],
  },
]

const sideIndex = ref(0)
const side = computed(() => SIDES[sideIndex.value] ?? SIDES[0]!)
const isAbout = computed(() => sideIndex.value === 0)

// The copy swaps on the same frame as the click. Everything after that is a
// short burst of tearing on top of the already-swapped card, so the flip reads
// as a hard cut rather than a fade.
const CUT_MS = 220

// Horizontal slices of the card that shear sideways and snap back. They all
// carry the accent, so the overlap reads as one signal doubling rather than an
// RGB split. Percentages are of the copy block's height, offsets are px.
const TEAR_BANDS = [
  { top: 0, bottom: 18, x: -22, delay: 0 },
  { top: 14, bottom: 34, x: 16, delay: 20 },
  { top: 31, bottom: 52, x: -12, delay: 0 },
  { top: 48, bottom: 66, x: 26, delay: 40 },
  { top: 62, bottom: 84, x: -18, delay: 20 },
  { top: 80, bottom: 100, x: 14, delay: 40 },
]

const cutting = ref(false)

// Bumped on every click so a rapid second flip remounts the animated layers and
// restarts the burst instead of riding out the first one.
const cutKey = ref(0)

let cutTimer: ReturnType<typeof setTimeout> | undefined

function aboutReducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  }
  catch {
    return false
  }
}

function toggleSide() {
  sideIndex.value = sideIndex.value === 0 ? 1 : 0

  if (aboutReducedMotion())
    return

  cutKey.value++
  cutting.value = true

  clearTimeout(cutTimer)
  cutTimer = setTimeout(() => {
    cutting.value = false
  }, CUT_MS)
}

onBeforeUnmount(() => clearTimeout(cutTimer))

// Diamond centers lifted from the constellation paths below, one per link in order.
const DESKTOP_STARS = [
  [9.192, 102.192],
  [256.192, 63.192],
  [477.192, 52.192],
  [693.192, 9.192],
  [847.192, 92.192],
]

const MOBILE_STARS = [
  [9.192, 9.192],
  [38.192, 106.192],
  [96.192, 176.192],
  [169.192, 222.192],
  [255.192, 329.192],
]

// The stars that foreshadow the diamonds. They parallax the way the backdrop
// stars do: held near-fixed on screen while the page slides under them. Each
// one waits at the spot where its diamond will land, so the constellation is
// already in the sky while the join copy scrolls past over it, and the
// diamonds climb up to meet the stars.

// How much of the climb each star holds against. 1 keeps the star dead still
// on screen, a touch under drifts up slowly like the backdrop's moving stars.
// Fixed rather than random so the constellation always drifts the same way.
const STAR_LEAD = [1, 0.96, 0.98, 1, 0.97]
// Where the block lands: the diamonds reach the stars once the block's bottom
// has climbed to this fraction of the viewport height. Landing at the bottom
// edge instead would hold the stars right on that edge, barely on screen.
const SETTLE_AT = 0.65
// Over the last few px of climb the star gives up its lead and picks up the
// page's motion, so it lands instead of snapping.
const LEAD_EASE = 24
// The join section clips anything above its top edge, so a star's lead is
// capped at the room between it and that edge. Past the cap the star rides up
// with the page instead of holding. That's how it comes into view: it arrives
// with the section, parks at its hold spot, and waits for the diamond. Kept a
// little inside the edge so the dot never touches the clip.
const HEADROOM_MARGIN = 16
// Width of the blend between riding and holding, so the hand-off is smooth.
const CAP_BLEND = 40
// How long a star takes to glide into its diamond on hover.
const GLIDE_MS = 300
// Flicker delay and duration per star, so they don't twinkle in unison.
const STAR_FLICKER = [[0, 2400], [1300, 3100], [2600, 2700], [700, 3500], [2000, 2900]]

const joinEl = ref<HTMLElement | null>(null)
const constellationEl = ref<HTMLElement | null>(null)
// Pixels the block still has to climb before it lands.
const climb = ref(0)
// Pixels between the block's top and the join section's clip edge.
const headroom = ref(0)
const reducedMotion = usePreferredReducedMotion()
const { y: scrollY } = useWindowScroll()
const { height: viewportHeight } = useWindowSize()

function measureClimb() {
  const host = constellationEl.value
  const join = joinEl.value
  if (!host || !join)
    return

  const rect = host.getBoundingClientRect()
  climb.value = Math.max(0, rect.bottom - window.innerHeight * SETTLE_AT)
  headroom.value = Math.max(0, rect.top - join.getBoundingClientRect().top - HEADROOM_MARGIN)
}

// min(a, b) with the corner rounded off over about k px either side.
function softMin(a: number, b: number, k: number): number {
  return Math.min(a, b) - k * Math.log(1 + Math.exp(-Math.abs(a - b) / k))
}

// Tracks the climb 1:1 and rounds off over the last LEAD_EASE px. No cap: the
// join section's overflow clips whatever sits above its top edge, so the stars
// simply come into view as the section does.
const starLead = computed(() => {
  if (reducedMotion.value === 'reduce')
    return 0

  const d = climb.value

  return (d * d) / (d + LEAD_EASE)
})

// Hovering or focusing a link pulls its star into the diamond even if the block
// hasn't settled yet, so the flare lights up around a star that's actually
// there. The glide class stays on for a beat after leaving so it eases back out
// too, then comes off so scroll tracking is instant again.
const alignedStar = ref<number | null>(null)
const glidingStar = ref<number | null>(null)
let glideTimer: ReturnType<typeof setTimeout> | undefined

function alignStar(index: number) {
  clearTimeout(glideTimer)
  alignedStar.value = index
  glidingStar.value = index
}

function releaseStar(index: number) {
  if (alignedStar.value !== index)
    return

  alignedStar.value = null
  glideTimer = setTimeout(() => {
    glidingStar.value = null
  }, GLIDE_MS)
}

function starStyle(star: number[], index: number): CSSProperties {
  const [x = 0, y = 0] = star
  const [delay = 0, duration = 2000] = STAR_FLICKER[index] ?? []
  // Room to the clip edge grows with how far down the block the star sits.
  const room = headroom.value + y
  const lead = alignedStar.value === index
    ? 0
    : Math.max(0, softMin(starLead.value * (STAR_LEAD[index] ?? 1), room, CAP_BLEND))

  return {
    'left': `${x}px`,
    'top': `${y}px`,
    '--star-lead': `${lead}px`,
    '--star-animation-offset': `${delay}ms`,
    '--star-animation-duration': `${duration}ms`,
  }
}

onMounted(measureClimb)
onBeforeUnmount(() => clearTimeout(glideTimer))
watch([scrollY, viewportHeight], measureClimb)
</script>

<template>
  <div class="home-page">
    <!-- Corner brackets that start in the corners of the hero, settle on each
         big tile as it scrolls into view or gets hovered, and stay parked on
         the join block at the end. -->
    <FocusFrame>
      <!-- The hero fills the viewport, so the brackets pull inside it, and
           further at the top to clear the fixed nav (64px). -->
      <FocusTarget :padding="-24" :padding-top="-88" no-hover>
        <LandingHero />
      </FocusTarget>

      <GlowGroup>
        <div class="container-m">
          <section id="hero" class="hero">
            <FocusTarget>
              <GlowCard class="glow-card-home">
                <div class="home-card centered home-card--about typeset" :class="{ 'is-cut': cutting }" @click="toggleSide">
                  <!-- The actual warp. Turbulence with a near-zero X frequency gives one
                       noise value per row, so displacing by it shreds the copy into
                       horizontal slips instead of a soft wobble. Remounted on every click
                       via the key, which is what restarts the SMIL timeline. -->
                  <svg :key="cutKey" class="about-distort-defs" aria-hidden="true" focusable="false">
                    <!-- Copy block. The regions are generous because displaced pixels get
                         clipped to them, and a tight region just eats the shred. -->
                    <filter id="about-distort" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
                      <feTurbulence type="fractalNoise" baseFrequency="0.00001 0.12" numOctaves="1" seed="11" result="shred">
                        <animate
                          attributeName="baseFrequency"
                          dur="0.22s"
                          calcMode="discrete"
                          values="0.00001 0.3;0.00001 0.05;0.00001 0.5;0.00001 0.09;0.00001 0.2;0.00001 0"
                          fill="freeze"
                        />
                      </feTurbulence>
                      <feDisplacementMap in="SourceGraphic" in2="shred" xChannelSelector="R" yChannelSelector="G" scale="0">
                        <animate
                          attributeName="scale"
                          dur="0.22s"
                          calcMode="discrete"
                          values="56;18;40;9;3;0"
                          fill="freeze"
                        />
                      </feDisplacementMap>
                    </filter>

                    <!-- Same warp scaled down for the atype. The barcode is 16px tall and the
                         corner marks are 9px, so the copy block's displacement would push
                         every pixel clean out of the region and just blank them. -->
                    <filter id="about-distort-fine" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">
                      <feTurbulence type="fractalNoise" baseFrequency="0.00001 0.4" numOctaves="1" seed="3" result="shredFine">
                        <animate
                          attributeName="baseFrequency"
                          dur="0.2s"
                          calcMode="discrete"
                          values="0.00001 0.9;0.00001 0.25;0.00001 1.4;0.00001 0.4;0.00001 0"
                          fill="freeze"
                        />
                      </feTurbulence>
                      <feDisplacementMap in="SourceGraphic" in2="shredFine" xChannelSelector="R" yChannelSelector="G" scale="0">
                        <animate
                          attributeName="scale"
                          dur="0.2s"
                          calcMode="discrete"
                          values="14;5;10;3;0"
                          fill="freeze"
                        />
                      </feDisplacementMap>
                    </filter>
                  </svg>

                  <span class="corner-text">
                    <span :key="cutKey" class="corner-text__inner"><AtypeText :name="side.corner" :height="9" /></span>
                  </span>
                  <span class="corner-text right">
                    <span :key="cutKey" class="corner-text__inner"><AtypeText :name="side.cornerRight" :height="9" /></span>
                  </span>

                  <!-- Both sides are always rendered and stacked in one grid cell, so the
                       card is always as tall as the taller side and the layout never shifts. -->
                  <div :key="cutKey" class="about-stack" :class="{ 'about-stack--cut': cutting }">
                    <div
                      v-for="(entry, entryIndex) in SIDES"
                      :key="entryIndex"
                      class="about-swap"
                      :class="{ 'about-swap--active': entryIndex === sideIndex }"
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

                    <!-- Torn copies of the side that just landed. Each band clips to a
                         slice, shears sideways and snaps back in accent. Purely
                         decorative, gone in 220ms. -->
                    <div v-if="cutting" class="about-tear" aria-hidden="true">
                      <div
                        v-for="(band, bandIndex) in TEAR_BANDS"
                        :key="bandIndex"
                        class="about-tear__band"
                        :style="{
                          'clip-path': `inset(${band.top}% 0 ${100 - band.bottom}% 0)`,
                          '--tear-x': `${band.x}px`,
                          '--tear-delay': `${band.delay}ms`,
                        }"
                      >
                        <h2>{{ side.heading }}</h2>
                        <p v-for="(line, index) in side.lines" :key="index">
                          <b v-if="line.strong">{{ line.text }}</b>
                          <template v-else>
                            {{ line.text }}
                          </template>
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- The whole card flips on click. The barcode stays a button so keyboard
                       and screen reader users get a focusable target. Its click bubbles up
                       to the card, so it has no handler of its own. -->
                  <button
                    type="button"
                    class="about-barcode"
                    :aria-label="isAbout ? 'Show our mantra' : 'Show about us'"
                  >
                    <AtypeText :name="side.barcode" :height="16" />

                    <!-- Channel ghosts of the new barcode, offset either way for the two
                         frames the cut lasts. Keyed off the button so focus survives. -->
                    <span v-if="cutting" :key="cutKey" class="about-barcode__ghosts" aria-hidden="true">
                      <span class="about-barcode__ghost about-barcode__ghost--a"><AtypeText :name="side.barcode" :height="16" /></span>
                      <span class="about-barcode__ghost about-barcode__ghost--b"><AtypeText :name="side.barcode" :height="16" /></span>
                    </span>
                  </button>
                </div>
              </GlowCard>
            </FocusTarget>
          </section>
        </div>

        <div class="container-m ">
          <FocusTarget>
            <section class="home-events">
              <EventSmall v-for="event in events" :key="event.id" :data="event" :no-glow="false" class="glow-card-home" />
              <div class="card-pointer top-right" data-text="Upcoming events">
                <!-- <AtypeText name="guideEvents" :height="12" /> -->
              </div>
              <div class="card-pointer bottom-left" data-text="What we're up to">
                <!-- <AtypeText name="guideActivity" :height="12" /> -->
              </div>
            </section>
          </FocusTarget>
        </div>

        <section class="">
          <div class="container-m">
            <div class="relative">
              <FocusTarget>
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
                        <NuxtLink v-for="copy in 3" :key="copy" :to="`/forum/${item.id}`">
                          {{ item.title }}{{ item.description ? `: ${item.description}` : '' }}
                        </NuxtLink>
                      </p>
                    </Marquee>
                  </div>
                </GlowCard>
              </FocusTarget>
              <div class="card-pointer bottom-right" data-text="Forum">
                <!-- <AtypeText name="guideForum" :height="12" /> -->
              </div>
            </div>
          </div>
        </section>
      </GlowGroup>
      <div ref="joinEl" class="home-join">
        <LandingSun class="home-join__sun" />
        <FocusTarget class="container-s">
          <template v-if="isMember">
            <h2>Bring someone along</h2>
            <p>
              Everyone here got in because somebody thought to mention it. If you know someone who'd
              fit, send them the link.
            </p>
            <button type="button" class="join-button" @click="copySignUpLink">
              Copy sign-up link
            </button>

            <p>Or point them at...</p>
          </template>

          <template v-else>
            <h2>Come hang out</h2>
            <p>
              Chat via an actual account, share your favorite plant fact on the forum and RSVP
              for the next game night. No cost or privacy implications attached!
            </p>
            <NuxtLink to="/auth/sign-up" class="join-button">
              Sign up
            </NuxtLink>

            <p>Or find us on...</p>
          </template>
        </FocusTarget>

        <div ref="constellationEl" class="constellation">
          <!-- The links have to stay the first children: their positions and the
               flare hover both key off nth-child. -->
          <a
            v-for="(link, _name, index) in constants.LINKS"
            :key="link.name"
            target="_blank"
            rel="noreferer noopener"
            :href="link.url"
            @mouseenter="alignStar(index)"
            @mouseleave="releaseStar(index)"
            @focus="alignStar(index)"
            @blur="releaseStar(index)"
          >
            {{ link.name }}
          </a>

          <svg class="desktop-constellation" width="857" height="112" viewBox="0 0 857 112" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M34.624 100.214L237.624 66.214M274.707 61.7071L456.707 53.2192M498.707 50.2071L669.207 11.2955M710.99 11.2955L829.707 83.7071M0.707031 102.192L9.19231 93.7071L17.6776 102.192L9.19231 110.678L0.707031 102.192ZM838.707 92.1924L847.192 83.7071L855.678 92.1924L847.192 100.678L838.707 92.1924ZM247.707 63.1924L256.192 54.7071L264.678 63.1924L256.192 71.6777L247.707 63.1924ZM684.707 9.19239L693.192 0.707108L701.678 9.19239L693.192 17.6777L684.707 9.19239ZM468.707 52.1924L477.192 43.7071L485.678 52.1924L477.192 60.6777L468.707 52.1924Z" stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="2 2" />
            <defs>
              <radialGradient id="constellation-glow-desktop">
                <stop class="flare-glow-hot" offset="0%" stop-opacity="0.9" />
                <stop offset="30%" stop-opacity="0.4" />
                <stop offset="100%" stop-opacity="0" />
              </radialGradient>
            </defs>
            <g v-for="([x, y], index) in DESKTOP_STARS" :key="index" class="constellation-flare" :data-flare="index + 1" :transform="`translate(${x} ${y})`">
              <circle class="flare-glow" r="20" fill="url(#constellation-glow-desktop)" />
              <path class="flare-sparkle" d="M9 -9L2 0L9 9L0 2L-9 9L-2 0L-9 -9L0 -2Z" />
              <path class="flare-streak" d="M0 -16L1.5 -1.5L44 0L1.5 1.5L0 16L-1.5 1.5L-44 0L-1.5 -1.5Z" />
              <path class="flare-streak-hot" d="M0 -9L1 -1L30 0L1 1L0 9L-1 1L-30 0L-1 -1Z" />
              <path class="flare-core" d="M0 -8.485L8.485 0L0 8.485L-8.485 0Z" />
              <path class="flare-core-hot" d="M0 -4L4 0L0 4L-4 0Z" />
            </g>
          </svg>

          <svg class="mobile-constellation" width="265" height="339" viewBox="0 0 265 339" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M29.707 86.707L11.707 26.707M83.707 162.707L49.707 120.707M153.707 211.707L112.707 187.707M242.707 314.707L183.707 236.707M0.707031 9.19231L9.19231 0.707031L17.6776 9.19231L9.19231 17.6776L0.707031 9.19231ZM29.707 106.192L38.1923 97.707L46.6776 106.192L38.1923 114.678L29.707 106.192ZM87.707 176.192L96.1923 167.707L104.678 176.192L96.1923 184.678L87.707 176.192ZM160.707 222.192L169.192 213.707L177.678 222.192L169.192 230.678L160.707 222.192ZM246.707 329.192L255.192 320.707L263.678 329.192L255.192 337.678L246.707 329.192Z" stroke="currentColor" stroke-opacity="0.5" stroke-dasharray="2 2" />
            <defs>
              <radialGradient id="constellation-glow-mobile">
                <stop class="flare-glow-hot" offset="0%" stop-opacity="0.9" />
                <stop offset="30%" stop-opacity="0.4" />
                <stop offset="100%" stop-opacity="0" />
              </radialGradient>
            </defs>
            <g v-for="([x, y], index) in MOBILE_STARS" :key="index" class="constellation-flare" :data-flare="index + 1" :transform="`translate(${x} ${y})`">
              <circle class="flare-glow" r="20" fill="url(#constellation-glow-mobile)" />
              <path class="flare-sparkle" d="M9 -9L2 0L9 9L0 2L-9 9L-2 0L-9 -9L0 -2Z" />
              <path class="flare-streak" d="M0 -16L1.5 -1.5L44 0L1.5 1.5L0 16L-1.5 1.5L-44 0L-1.5 -1.5Z" />
              <path class="flare-streak-hot" d="M0 -9L1 -1L30 0L1 1L0 9L-1 1L-30 0L-1 -1Z" />
              <path class="flare-core" d="M0 -8.485L8.485 0L0 8.485L-8.485 0Z" />
              <path class="flare-core-hot" d="M0 -4L4 0L0 4L-4 0Z" />
            </g>
          </svg>

          <!-- One set of stars per layout, shown and hidden with the matching SVG. -->
          <div class="constellation-stars constellation-stars--desktop" aria-hidden="true">
            <div v-for="(star, index) in DESKTOP_STARS" :key="index" class="constellation-star" :class="{ 'is-gliding': glidingStar === index }" :style="starStyle(star, index)" />
          </div>
          <div class="constellation-stars constellation-stars--mobile" aria-hidden="true">
            <div v-for="(star, index) in MOBILE_STARS" :key="index" class="constellation-star" :class="{ 'is-gliding': glidingStar === index }" :style="starStyle(star, index)" />
          </div>
        </div>
      </div>
    </FocusFrame>
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

  // Atype strip that rides the horizontal run of the pointer line.
  .atype-text {
    position: absolute;
    color: var(--color-text-lightest);
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

    .atype-text {
      top: 12px;
      left: 96px;
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

    .atype-text {
      bottom: 12px;
      left: 24px;
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

    .atype-text {
      bottom: 12px;
      left: 96px;
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

  // Renders as a link for guests and a button for members, so reset the button
  // chrome the global styles leave alone.
  .join-button {
    display: flex;
    border: none;
    font-family: inherit;
    font-size: inherit;
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
    // Lines and the hot centres of the flares were white, which is nothing on a
    // light background. Drawing them in the text colour flips them with the theme.
    --constellation-ink: var(--color-text);

    display: inline-block;
    margin: auto;
    // No z-index on purpose: this must not be a stacking context, so the star
    // layer's negative z-index can drop behind the join copy above. The links
    // and SVG still paint over the sun by tree order.
    position: relative;
    margin-top: 164px;

    .mobile-constellation,
    .constellation-stars--mobile {
      display: none;
    }

    @media screen and (max-width: $breakpoint-m) {
      padding-bottom: 128px;
      margin-top: 96px;

      .desktop-constellation,
      .constellation-stars--desktop {
        display: none;
      }

      .mobile-constellation,
      .constellation-stars--mobile {
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

    svg {
      overflow: visible;
      color: var(--constellation-ink);
    }

    // Overlays the SVG exactly, so the diamond coordinates work as px offsets.
    // The negative z-index resolves against the page, so the stars sit behind
    // everything on it like the backdrop stars do: labels, the join copy and
    // the flare all paint over them.
    .constellation-stars {
      position: absolute;
      inset: 0;
      z-index: -1;
      pointer-events: none;
    }

    // Same dot as the backdrop stars, sized to sit inside the diamond.
    .constellation-star {
      --star-lead: 0px;
      --star-animation-offset: 0ms;
      --star-animation-duration: 2000ms;
      --star-base-opacity: 1;

      position: absolute;
      width: 2.5px;
      height: 2.5px;
      // Centre on the diamond, then sit ahead of it by the scroll lead.
      transform: translate(-50%, -50%) translateY(calc(var(--star-lead) * -1));
      background-color: var(--color-text);
      border-radius: 50%;
      animation: star-flicker var(--star-animation-duration) infinite linear;
      animation-delay: var(--star-animation-offset);

      // Only while gliding into or out of a hovered diamond. Scroll tracking
      // stays instant otherwise.
      &.is-gliding {
        transition: transform 0.3s ease;
      }
    }

    stop {
      stop-color: var(--color-accent);

      &.flare-glow-hot {
        stop-color: var(--constellation-ink);
      }
    }

    .constellation-flare {
      color: var(--color-accent);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;

      .flare-streak,
      .flare-sparkle,
      .flare-core {
        fill: currentColor;
      }

      .flare-streak {
        fill-opacity: 0.55;
      }

      .flare-sparkle {
        fill-opacity: 0.35;
      }

      .flare-streak-hot,
      .flare-core-hot {
        fill: var(--constellation-ink);
        fill-opacity: 0.9;
      }
    }

    @for $i from 1 through 5 {
      a:nth-child(#{$i}):hover ~ svg [data-flare='#{$i}'],
      a:nth-child(#{$i}):focus-visible ~ svg [data-flare='#{$i}'] {
        opacity: 1;
        transition: none;
        animation: constellation-flicker 0.35s linear;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .constellation-flare {
        animation: none !important;
      }
    }
  }
}

@include star-flicker;

@keyframes constellation-flicker {
  0% {
    opacity: 0;
  }

  8%,
  14% {
    opacity: 1;
  }

  15%,
  22% {
    opacity: 0.25;
  }

  23%,
  34% {
    opacity: 1;
  }

  35%,
  42% {
    opacity: 0.55;
  }

  43%,
  100% {
    opacity: 1;
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
  // Clicking anywhere on the card flips it.
  cursor: pointer;

  @media screen and (max-width: $breakpoint-m) {
    // Bottom stays clear of the barcode, which sits 24px up and is 48px tall
    // including its padding.
    padding: 64px 32px 104px;
  }

  // Filter defs only, nothing to paint.
  .about-distort-defs {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
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

  // The corner atype changes message with the side, so it takes the same hit as
  // the copy: a couple of dropped frames and a nudge, tinted on the way through.
  &.is-cut .corner-text__inner {
    display: block;
    animation: about-corner-cut 180ms steps(1, end) both;

    .atype-text {
      filter: url('#about-distort-fine');
    }
  }

  &.right.is-cut .corner-text__inner {
    animation-delay: 30ms;
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
    color: var(--color-text-lightest);
    transition: color var(--transition-fast);

    // The barcode is drawn one module per px, keep the edges from smearing.
    .atype-text {
      shape-rendering: crispEdges;
    }

    &:focus-visible {
      outline: 1px solid var(--color-accent);
      outline-offset: 4px;
    }
  }

  // The whole card flips, so the barcode lights up for a hover anywhere on it.
  &:hover .about-barcode {
    color: var(--color-accent);
  }

  &.is-cut .about-barcode .atype-text {
    filter: url('#about-distort-fine');
    animation: about-barcode-cut 200ms steps(1, end) both;
  }

  // Two accent copies of the new barcode, thrown either side of the real one for
  // the length of the cut. Screen blend so the overlap builds rather than smears.
  .about-barcode__ghosts {
    position: absolute;
    inset: var(--space-s);
    pointer-events: none;
    mix-blend-mode: screen;
  }

  .about-barcode__ghost {
    position: absolute;
    inset: 0;
    color: var(--color-accent);

    .atype-text {
      shape-rendering: crispEdges;
      filter: url('#about-distort-fine');
    }

    &--a {
      animation: about-barcode-ghost-a 200ms steps(1, end) both;
    }

    &--b {
      animation: about-barcode-ghost-b 200ms steps(1, end) both;
    }
  }
}

@keyframes about-corner-cut {
  0% {
    opacity: 0;
    transform: translate3d(6px, 0, 0);
  }
  20% {
    opacity: 1;
    color: var(--color-accent);
    transform: translate3d(-4px, 0, 0);
  }
  45% {
    opacity: 0;
    transform: none;
  }
  70% {
    opacity: 1;
    color: var(--color-accent);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes about-barcode-cut {
  0% {
    opacity: 0.2;
    transform: scaleX(1.35) skewX(-14deg);
  }
  15% {
    opacity: 1;
    transform: scaleX(0.82) skewX(9deg);
  }
  32% {
    opacity: 0.3;
    transform: scaleX(1.12);
  }
  50% {
    opacity: 1;
    transform: scaleX(0.96);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes about-barcode-ghost-a {
  0% {
    opacity: 1;
    transform: translate3d(-14px, -2px, 0) scaleX(1.2);
  }
  35% {
    opacity: 1;
    transform: translate3d(9px, 1px, 0);
  }
  70% {
    opacity: 0.5;
    transform: translate3d(-3px, 0, 0);
  }
  100% {
    opacity: 0;
    transform: none;
  }
}

@keyframes about-barcode-ghost-b {
  0% {
    opacity: 1;
    transform: translate3d(13px, 2px, 0) scaleX(0.86);
  }
  35% {
    opacity: 1;
    transform: translate3d(-8px, -1px, 0);
  }
  70% {
    opacity: 0.5;
    transform: translate3d(4px, 0, 0);
  }
  100% {
    opacity: 0;
    transform: none;
  }
}

// Both sides live in one grid cell, so the card height is the taller of the two
// and never shifts when swapping. Only the active side is visible.
.about-stack {
  display: grid;
  position: relative;
}

// The swap itself is instant: the click flips which side is visible on the same
// frame. Everything below is a 200ms burst of tearing played over the copy that
// already landed, all of it on steps() so the frames snap instead of easing.
.about-swap {
  grid-area: 1 / 1;
  opacity: 0;
  pointer-events: none;

  &--active {
    opacity: 1;
    pointer-events: auto;
  }
}

.about-stack--cut .about-swap--active {
  animation: about-cut 200ms steps(1, end) both;
  will-change: opacity, transform, filter;
}

@keyframes about-cut {
  0% {
    opacity: 0;
    transform: translate3d(7px, -2px, 0) skewX(-7deg);
    filter: url('#about-distort') brightness(2.4) contrast(0.5);
  }
  12% {
    opacity: 1;
    transform: translate3d(-6px, 1px, 0) skewX(5deg);
    filter: url('#about-distort') brightness(1.7);
  }
  26% {
    opacity: 0.25;
    transform: translate3d(4px, 0, 0);
    filter: url('#about-distort');
  }
  38% {
    opacity: 1;
    transform: translate3d(-2px, 0, 0) skewX(-2deg);
    filter: url('#about-distort');
  }
  62% {
    transform: translate3d(1px, 0, 0);
    filter: url('#about-distort');
  }
  100% {
    opacity: 1;
    transform: none;
    filter: none;
  }
}

// Torn slices of the copy, stacked over the real thing and blended additively so
// overlapping slices build up instead of smearing.
.about-tear {
  grid-area: 1 / 1;
  position: relative;
  pointer-events: none;
  z-index: 2;
  mix-blend-mode: screen;

  &__band {
    position: absolute;
    inset: 0;
    color: var(--color-accent);
    animation: about-tear-band 150ms steps(1, end) var(--tear-delay) both;
    will-change: transform, opacity;

    b {
      color: inherit;
    }
  }
}

@keyframes about-tear-band {
  0% {
    opacity: 1;
    transform: translate3d(var(--tear-x), 0, 0);
  }
  35% {
    opacity: 1;
    transform: translate3d(calc(var(--tear-x) * -0.5), 0, 0);
  }
  65% {
    opacity: 0.7;
    transform: translate3d(calc(var(--tear-x) * 0.25), 0, 0);
  }
  100% {
    opacity: 0;
    transform: none;
  }
}

// Reduced motion gets the swap with none of the tearing: toggleSide bails before
// setting the cut flag, so these are a belt-and-braces guard.
@media (prefers-reduced-motion: reduce) {
  .about-stack--cut .about-swap--active,
  .about-tear__band,
  .home-card--about.is-cut .corner-text__inner,
  .home-card--about.is-cut .about-barcode .atype-text {
    animation: none !important;
  }

  .about-stack--cut .about-swap--active,
  .home-card--about.is-cut .corner-text__inner .atype-text,
  .home-card--about.is-cut .about-barcode .atype-text,
  .about-barcode__ghost .atype-text {
    filter: none !important;
  }

  .about-tear,
  .about-barcode__ghosts {
    display: none;
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
