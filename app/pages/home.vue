<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { Tables } from '@/types/database.types'
import { Marquee } from '@dolanske/vui'
import constants from '~~/constants.json'
import EventSmall from '@/components/Events/EventSmall.vue'
import LandingHero from '@/components/Landing/LandingHero.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

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

// Randomly generate 100 stars
const STAR_COUNT = 75
const STAR_TRANSFORM_THRESHOLD = 0.4
const stars = shallowRef<CSSProperties[]>([])

const { y } = useWindowScroll()

onBeforeMount(() => {
  const _stars = []
  for (let i = 0; i < STAR_COUNT; i++) {
    const size = Math.random() * 2 + 0.5
    const verticalRandom = Math.random()
    const baseOpacity = Math.random() * 0.45 + 0.55

    _stars.push({
      'left': `${Math.random() * window.innerWidth}px`,
      'top': `${Math.random() * window.innerHeight}px`,
      'width': `${size}px`,
      'height': `${size}px`,
      '--star-animation-offset': `${Math.random() * 10000}ms`,
      '--star-animation-duration': `${Math.random() * 2000 + 2000}ms`,
      '--star-base-opacity': `${baseOpacity}`,
      '--vertical-random-multiplier': `${verticalRandom < STAR_TRANSFORM_THRESHOLD ? 0 : (verticalRandom - STAR_TRANSFORM_THRESHOLD) * 1.5}`,
      '--vertical-offset': 0,
    })
  }

  stars.value = _stars
})
</script>

<template>
  <div class="home-page">
    <!-- TODO: needs to be decoupled -->
    <LandingHero />

    <GlowGroup>
      <div class="container-m">
        <section class="hero ">
          <GlowCard class="glow-card-home">
            <div class="home-card centered home-card--about typeset">
              <span class="corner-text">##########</span>
              <span class="corner-text right">DLN // ZLS</span>
              <h2>
                About us
              </h2>
              <p>
                The community was originally created by
                <UserDisplay size="s" inline user-id="c57fa854-f33a-40ee-a326-33f18760a4a3" />
                <UserDisplay size="s" inline user-id="c8285417-e04c-4028-b02d-59711552bc4c" />
                <UserDisplay size="s" inline user-id="363f4c51-6ae9-4115-b8eb-01b9760fb6d0" />
              </p>
              <p>
                We started hosting a server back in 2013 on an in-home Raspberry Pi but the growing demand for a better
                connection
                and 24/7 uptime made us reconsider this small hosting plan. We later that year went over to actually
                acquiring
                a dedicated TeamSpeak server from Fragnet but later on switched to what is now a server entirely run and
                managed by
                Hivecom itself.
              </p>
              <p>
                Hivecom has come a long way since then and wouldn't be anything without those that make up its
                community. We're incredibly thankful
                for what we have now considering this all started with three friends getting together to chat and hang
                out.
              </p>
              <p>
                <b>We are always happy to welcome anyone willing to join us for this journey.</b>
              </p>
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

        <svg width="857" height="112" viewBox="0 0 857 112" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M34.624 100.214L237.624 66.214M274.707 61.7071L456.707 53.2192M498.707 50.2071L669.207 11.2955M710.99 11.2955L829.707 83.7071M0.707031 102.192L9.19231 93.7071L17.6776 102.192L9.19231 110.678L0.707031 102.192ZM838.707 92.1924L847.192 83.7071L855.678 92.1924L847.192 100.678L838.707 92.1924ZM247.707 63.1924L256.192 54.7071L264.678 63.1924L256.192 71.6777L247.707 63.1924ZM684.707 9.19239L693.192 0.707108L701.678 9.19239L693.192 17.6777L684.707 9.19239ZM468.707 52.1924L477.192 43.7071L485.678 52.1924L477.192 60.6777L468.707 52.1924Z" stroke="white" stroke-opacity="0.25" stroke-dasharray="2 2" />
        </svg>
      </div>
    </div>

    <div
      v-for="star in stars"
      :key="`${star.left} + ${star.top}`" class="star"
      :style="{ ...star,
                '--vertical-offset': `${y * -0.05}px` }"
    />
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

.star {
  --star-animation-offset: 0ms;
  --star-animation-duration: 2000ms;
  --star-base-opacity: 1;
  --vertical-random-multiplier: 0;
  --vertical-offset: 0px;

  transform: translateY(calc(var(--vertical-offset) * var(--vertical-random-multiplier)));

  position: fixed;
  background-color: var(--color-text);
  border-radius: 50%;
  animation: star-flicker 2000ms infinite linear;
  animation-delay: var(--star-animation-offset);
  animation-duration: var(--star-animation-duration);
  z-index: -1;
}

@keyframes star-flicker {
  0%,
  15%,
  35%,
  55%,
  75%,
  100% {
    opacity: calc(var(--star-base-opacity) * 1);
    background: white;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
  }

  10% {
    opacity: calc(var(--star-base-opacity) * 0.75);
  }

  20% {
    opacity: calc(var(--star-base-opacity) * 0.85);
    background: rgb(160, 210, 255);
    filter: drop-shadow(0 0 8px rgba(120, 190, 255, 1));
  }

  25% {
    opacity: calc(var(--star-base-opacity) * 1);
    background: white;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
  }

  45% {
    opacity: calc(var(--star-base-opacity) * 0.7);
  }

  60% {
    opacity: calc(var(--star-base-opacity) * 0.85);
    background: rgb(255, 190, 190);
    filter: drop-shadow(0 0 8px rgba(255, 120, 120, 1));
  }

  65% {
    opacity: calc(var(--star-base-opacity) * 1);
    background: white;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
  }

  85% {
    opacity: calc(var(--star-base-opacity) * 0.8);
  }
}

.home-page {
  display: flex !important;
  flex-direction: column;
  gap: 128px;
  width: 100%;

  * {
    user-select: none;
  }
}

.home-join {
  text-align: center;
  word-wrap: balanced;
  width: 100%;
  position: relative;
  overflow: hidden;
  padding-bottom: 420px;

  &:after {
    content: '';
    position: absolute;
    width: 3063px;
    height: 1297px;
    left: 50%;
    transform: translateX(-50%);
    bottom: -1000px;
    background-color: var(--color-accent);
    border-radius: 100%;
    // TRANSFORM HERE
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
  }

  .constellation {
    display: inline-block;
    margin: auto;
    position: relative;
    margin-top: 164px;

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

  p:first-of-type {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-s);
  }

  &:after {
    content: '';
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background-image: url("data:image/svg+xml,%3Csvg width='128' height='12' viewBox='0 0 128 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 0H0V24H4V0Z' fill='%23A2F330'/%3E%3Cpath d='M8 0H6V24H8V0Z' fill='%23A2F330'/%3E%3Cpath d='M14 0H12V24H14V0Z' fill='%23A2F330'/%3E%3Cpath d='M24 0H22V24H24V0Z' fill='%23A2F330'/%3E%3Cpath d='M30 0H28V24H30V0Z' fill='%23A2F330'/%3E%3Cpath d='M42 0H38V24H42V0Z' fill='%23A2F330'/%3E%3Cpath d='M46 0H44V24H46V0Z' fill='%23A2F330'/%3E%3Cpath d='M52 0H50V24H52V0Z' fill='%23A2F330'/%3E%3Cpath d='M64 0H56V24H64V0Z' fill='%23A2F330'/%3E%3Cpath d='M68 0H66V24H68V0Z' fill='%23A2F330'/%3E%3Cpath d='M74 0H70V24H74V0Z' fill='%23A2F330'/%3E%3Cpath d='M80 0H78V24H80V0Z' fill='%23A2F330'/%3E%3Cpath d='M90 0H88V24H90V0Z' fill='%23A2F330'/%3E%3Cpath d='M96 0H94V24H96V0Z' fill='%23A2F330'/%3E%3Cpath d='M102 0H98V24H102V0Z' fill='%23A2F330'/%3E%3Cpath d='M112 0H110V24H112V0Z' fill='%23A2F330'/%3E%3Cpath d='M122 0H120V24H122V0Z' fill='%23A2F330'/%3E%3Cpath d='M130 0H126V24H130V0Z' fill='%23A2F330'/%3E%3Cpath d='M134 0H132V24H134V0Z' fill='%23A2F330'/%3E%3Cpath d='M144 0H140V24H144V0Z' fill='%23A2F330'/%3E%3Cpath d='M150 0H148V24H150V0Z' fill='%23A2F330'/%3E%3Cpath d='M158 0H154V24H158V0Z' fill='%23A2F330'/%3E%3Cpath d='M170 0H164V24H170V0Z' fill='%23A2F330'/%3E%3Cpath d='M174 0H172V24H174V0Z' fill='%23A2F330'/%3E%3Cpath d='M180 0H176V24H180V0Z' fill='%23A2F330'/%3E%3C/svg%3E%0A");
    width: 128px;
    height: 12px;
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
