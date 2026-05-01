<script setup lang="ts">
import HomeMarquee from '@/components/Landing/HomeMarquee.vue'
import LandingHeroBackground from '@/components/Landing/LandingHeroBackground.vue'

// Fetch the latest 6 forum posts and their title & description
const supabase = useSupabaseClient()
const maruqeeItems = ref<{ id: number, title: string, description: string | null }[]>([])

const MARQUEE_SPEED = 20

onBeforeMount(() => {
  supabase.from('discussions')
    .select('id, title, description')
    .eq('is_draft', false)
    .not('discussion_topic_id', 'is', null)
    .limit(5)
    .then(({ data }) => {
      if (data) {
        maruqeeItems.value = data
      }
    })
})
</script>

<template>
  <div class="home-page">
    <section class="hero mb-xxl">
      <div class="container-m">
        <div class="home-card centered home-card--about typeset">
          <h2>
            About us
          </h2>
          <p>
            The community was originally created by <b>Catlinman (now zealsprince), Jokler and Trif.</b>
          </p>
          <p>
            We started hosting a server back in 2013 on an in-home Raspberry Pi but the growing demand for a better connection
            and 24/7 uptime made us reconsider this small hosting plan. We later that year went over to actually acquiring
            a dedicated TeamSpeak server from Fragnet but later on switched to what is now a server entirely run and managed by
            Hivecom itself.
          </p>
          <p>
            Hivecom has come a long way since then and wouldn't be anything without those that make up its community. We're incredibly thankful
            for what we have now considering this all started with three friends getting together to chat and hang out.
          </p>
          <p>
            <b>We are always happy to welcome anyone willing to join us for this journey.</b>
          </p>
        </div>
      </div>

      <LandingHeroBackground />
    </section>

    <div class="container-m">
      <section>
        <div class="home-card home-card--forum">
          <HomeMarquee :speed="MARQUEE_SPEED" direction="left">
            <p>
              <NuxtLink to="/forum">
                LATEST FORUM POSTS LATEST FORUM POSTS LATEST FORUM POSTS
              </NuxtLink>
            </p>
          </HomeMarquee>
          <HomeMarquee v-for="(item, index) in maruqeeItems" :key="item.id" :speed="MARQUEE_SPEED" :direction="index % 2 === 0 ? 'right' : 'left'">
            <p>
              <NuxtLink :to="`/forum/${item.id}`">
                {{ item.title }}{{ item.description ? `: ${item.description}` : '' }}
              </NuxtLink>
            </p>
          </HomeMarquee>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.home-page {
  padding-block: max(10vh, 256px);
}

.home-card {
  border-radius: var(--border-radius-l);
  border: 1px solid var(--color-border);
  corner-shape: squircle;
  padding: var(--space-l);
  z-index: 2;
  position: relative;
  backdrop-filter: blur(50px);

  &.centered {
    text-align: center;
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: var(--color-bg-card);
    border-radius: var(--border-radius-l);
    z-index: -1;
    opacity: 0.8;
  }

  h2 {
    font-size: var(--font-size-xxxl);
    margin-bottom: var(--space-xl);
    text-transform: uppercase;
  }

  p {
    color: var(--color-text-light);
    text-wrap: balance;
    font-size: var(--font-size-l);

    b {
      color: var(--color-text);
    }
  }
}

//
// Home card variations (not nested for readability)
.home-card--about {
  padding-inline: var(--space-xxxl);
  padding-top: 96px;
  padding-bottom: 128px;

  &:after {
    content: '';
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background-image: url("data:image/svg+xml,%3Csvg width='128' height='17' viewBox='0 0 128 17' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 0H0V24H4V0Z' fill='%23A2F330'/%3E%3Cpath d='M8 0H6V24H8V0Z' fill='%23A2F330'/%3E%3Cpath d='M14 0H12V24H14V0Z' fill='%23A2F330'/%3E%3Cpath d='M24 0H22V24H24V0Z' fill='%23A2F330'/%3E%3Cpath d='M30 0H28V24H30V0Z' fill='%23A2F330'/%3E%3Cpath d='M42 0H38V24H42V0Z' fill='%23A2F330'/%3E%3Cpath d='M46 0H44V24H46V0Z' fill='%23A2F330'/%3E%3Cpath d='M52 0H50V24H52V0Z' fill='%23A2F330'/%3E%3Cpath d='M64 0H56V24H64V0Z' fill='%23A2F330'/%3E%3Cpath d='M68 0H66V24H68V0Z' fill='%23A2F330'/%3E%3Cpath d='M74 0H70V24H74V0Z' fill='%23A2F330'/%3E%3Cpath d='M80 0H78V24H80V0Z' fill='%23A2F330'/%3E%3Cpath d='M90 0H88V24H90V0Z' fill='%23A2F330'/%3E%3Cpath d='M96 0H94V24H96V0Z' fill='%23A2F330'/%3E%3Cpath d='M102 0H98V24H102V0Z' fill='%23A2F330'/%3E%3Cpath d='M112 0H110V24H112V0Z' fill='%23A2F330'/%3E%3Cpath d='M122 0H120V24H122V0Z' fill='%23A2F330'/%3E%3Cpath d='M130 0H126V24H130V0Z' fill='%23A2F330'/%3E%3Cpath d='M134 0H132V24H134V0Z' fill='%23A2F330'/%3E%3Cpath d='M144 0H140V24H144V0Z' fill='%23A2F330'/%3E%3Cpath d='M150 0H148V24H150V0Z' fill='%23A2F330'/%3E%3Cpath d='M158 0H154V24H158V0Z' fill='%23A2F330'/%3E%3Cpath d='M170 0H164V24H170V0Z' fill='%23A2F330'/%3E%3Cpath d='M174 0H172V24H174V0Z' fill='%23A2F330'/%3E%3Cpath d='M180 0H176V24H180V0Z' fill='%23A2F330'/%3E%3C/svg%3E%0A");
    width: 128px;
    height: 17px;
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
