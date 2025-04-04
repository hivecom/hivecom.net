<script setup lang="ts">
import { Button, Card, Divider, Switch } from '@dolanske/vui'

// For demonstration purposes only - replace with real data in production
const upcomingEvents = ref([
  { id: 1, title: 'Weekly Game Night', date: new Date(2025, 3, 10) },
  { id: 2, title: 'Tournament Finals', date: new Date(2025, 3, 17) },
  { id: 3, title: 'New Member Orientation', date: new Date(2025, 3, 25) },
])

const communityStats = ref({
  members: 400,
  gameservers: 20,
  age: 2025 - 2013,
  projects: 13,
})
</script>

<template>
  <!-- Hero section -->
  <section class="section-hero">
    <h1 class="section-hero-title">
      Hivecom
    </h1>
    <p class="section-hero-tagline">
      A community of friends from all around the world. Playing video games and creating things together.
    </p>
    <div class="section-hero-actions">
      <Button variant="fill" color="primary">
        Join Community
      </Button>
      <Button variant="accent">
        Learn More
      </Button>
    </div>
  </section>

  <!-- Community Stats -->
  <section class="section-stats">
    <h2 class="heading">
      Community Overview
    </h2>
    <Divider />

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ communityStats.members }}+</span>
        <span class="stat-label">Community Members</span>
      </div>

      <div class="stat-card">
        <span class="stat-value">{{ communityStats.gameservers }}</span>
        <span class="stat-label">Gameservers</span>
      </div>

      <div class="stat-card">
        <span class="stat-value">{{ communityStats.age }} Years</span>
        <span class="stat-label">Founded in 2013</span>
      </div>

      <div class="stat-card">
        <span class="stat-value">{{ communityStats.projects }}</span>
        <span class="stat-label">Open Source Projects</span>
      </div>
    </div>
  </section>

  <!-- About section -->
  <section class="section-about">
    <h2 class="heading">
      About Us
    </h2>
    <Divider />

    <div class="section-about-content">
      <p>
        The community was originally created by the three server administrators: Catlinman, Jokler and Trif.
        All three started hosting a server back in 2013 on a local machine but the growing demand for a better connection
        and 24/7 uptime made them reconsider this small hosting plan. They later that year went over to actually acquiring
        a dedicated Teamspeak server from Fragnet but later on switched to what is now a server entirely run and managed by Hivecom itself.
      </p>
      <p>
        Hivecom wouldn't be anything without its members though. The server now has a total of about 400 registered members
        and is constantly growing. We're incredibly thankful for what we have now considering this all started with three
        friends getting together to chat and hang out.
      </p>
      <p>
        We are always happy to welcome anyone willing to join and hang out. We host some gaming servers as well as regular hangouts on teamspeak.
      </p>
    </div>
  </section>

  <!-- Join us section -->
  <section class="section-join">
    <Card>
      <p class="join-text">
        We mainly talk on IRC and TeamSpeak. If discord is your thing, we have a bot connecting both services
        so you won't be excluded. Just join the <strong>#lounge</strong> channel.
      </p>

      <div class="platforms">
        <div class="platform">
          <h3>TeamSpeak</h3>
          <Button @click="navigateTo('/')">
            Connect
          </Button>
        </div>
        <div class="platform">
          <h3>IRC</h3>
          <Button @click="navigateTo('/')">
            Connect
          </Button>
        </div>
        <div class="platform">
          <h3>Discord</h3>
          <Button @click="navigateTo('/')">
            Connect
          </Button>
        </div>
        <div class="platform">
          <h3>Steam</h3>
          <Button @click="navigateTo('/')">
            Connect
          </Button>
        </div>
      </div>
    </Card>
  </section>

  <!-- Upcoming Events -->
  <section class="section-events">
    <h2 class="heading">
      Upcoming Events
    </h2>
    <Divider />

    <div class="events-list">
      <Card v-for="event in upcomingEvents" :key="event.id">
        <template #header>
          <h4>{{ event.title }}</h4>
        </template>
        <div class="event-details">
          <p>Date: {{ new Date(event.date).toLocaleDateString() }}</p>
        </div>
      </Card>
    </div>

    <div class="view-all">
      <Button @click="navigateTo('/events')">
        View All Events →
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.landing-page {
  padding-bottom: 3rem;
}

section {
  width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
  margin-bottom: 6rem;
}

.heading {
  text-align: center;
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}

h3 {
  font-size: 1.3rem;
  margin: 0;
}

h4 {
  font-size: 1.1rem;
  margin: 0;
}

.section-hero {
  text-align: center;
  padding: 4rem 0;

  &-title {
    font-size: 4rem;
    font-weight: bold;
    margin-bottom: 1rem;
  }

  &-tagline {
    font-size: 1.2rem;
    margin: 1rem 0 2rem;
    opacity: 0.8;
  }

  &-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }
}

.section-about {
  &-content {
    max-width: 900px;
    margin: 2rem auto 0;

    p {
      text-align: justify;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }

    .highlight-text {
      font-size: 1.2rem;
      font-weight: 500;
      padding: 1rem;
      border-left: 4px solid var(--vui-color-primary);
      background-color: rgba(var(--vui-color-primary-rgb), 0.05);
    }
  }
}

.section-join {
  .join-text {
    text-align: center;
    font-size: 1.2rem;
    margin-bottom: 2rem;
  }

  .platforms {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2rem;

    .platform {
      text-align: center;

      h3 {
        margin-bottom: 0.5rem;
      }
    }
  }
}

// Center the list and make sure it is responsive
.section-events {
  .events-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); /* Added back the grid template columns */
    gap: 1.5rem;
    margin-top: 2rem;
    justify-content: center; /* Added to center the list */
  }

  .event-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
}

.view-all {
  display: flex;
  align-items: center;
  margin-top: 1.5rem;
  text-align: center;
}

.stats-grid {
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
  margin-top: 2rem;
  gap: 2rem;
}

.stat-card {
  text-align: center;

  .stat-value {
    display: block;
    font-size: 2.5rem;
    font-weight: bold;
    color: var(--vui-color-primary);
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.8;
  }
}

.newsletter {
  &-toggle {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
  }
}
</style>
