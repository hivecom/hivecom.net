<script setup lang="ts">
import { Card, Divider, Flex, Grid } from '@dolanske/vui'
import FundingProgress from '@/components/Community/FundingProgress.vue'
import SupportCTA from '@/components/Community/SupportCTA.vue'
</script>

<template>
  <div class="page">
    <!-- Hero section -->
    <section>
      <h1>Community</h1>
      <p>Friends building things together</p>
    </section>

    <Divider />

    <!-- Community Overview -->
    <section class="mt-xl">
      <Grid :columns="2" gap="l" class="community-grid">
        <!-- About Our Community -->
        <Card class="about-card">
          <div class="about-card__content">
            <Flex column gap="m" expand>
              <Flex y-center gap="m" class="about-header">
                <div class="about-icon">
                  <Icon name="ph:users-three" size="2rem" />
                </div>
                <h3 class="text-bold text-xl">
                  About Our Community
                </h3>
              </Flex>

              <p class="about-description">
                Hivecom is a passionate community of developers, gamers, and friends who love building and sharing projects together. We host game servers, develop open-source tools, and create a welcoming space for collaboration.
              </p>

              <Flex expand column gap="xxs">
                <Flex y-center gap="s" class="mb-s">
                  <Icon name="ph:rocket-launch" size="1.2rem" class="color-accent" />
                  <h4 class="text-bold">
                    What We Do
                  </h4>
                </Flex>
                <Grid columns="2" class="activities-grid" expand>
                  <div class="activity-item">
                    <Icon name="ph:game-controller" size="1rem" class="activity-icon" />
                    <span>Host dedicated game servers</span>
                  </div>
                  <div class="activity-item">
                    <Icon name="ph:code" size="1rem" class="activity-icon" />
                    <span>Develop open-source projects</span>
                  </div>
                  <div class="activity-item">
                    <Icon name="ph:chat-circle" size="1rem" class="activity-icon" />
                    <span>Provide community platforms</span>
                  </div>
                  <div class="activity-item">
                    <Icon name="ph:share-network" size="1rem" class="activity-icon" />
                    <span>Share knowledge & resources</span>
                  </div>
                </Grid>
              </Flex>
            </Flex>
          </div>
          <div class="about-card__decoration" />
        </Card>

        <!-- Community Links -->
        <Card class="links-card">
          <div class="links-card__content">
            <Flex column gap="m" expand>
              <Flex y-center gap="m" class="links-header">
                <div class="links-icon">
                  <Icon name="ph:compass" size="2rem" />
                </div>
                <h3 class="text-bold text-xl">
                  Explore More
                </h3>
              </Flex>

              <Flex column gap="s" expand>
                <NuxtLink
                  to="/community/funding"
                  class="community-link community-link--funding"
                  aria-label="View our funding transparency and financial information"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:chart-bar" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Funding & Transparency
                      </div>
                      <div class="community-link__subtitle">
                        See how we're funded and where contributions go
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>

                <NuxtLink
                  to="/events"
                  class="community-link community-link--events"
                  aria-label="View upcoming community events and activities"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:calendar" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Community Events
                      </div>
                      <div class="community-link__subtitle">
                        Join our community events and online gatherings
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>

                <NuxtLink
                  to="/gameservers"
                  class="community-link community-link--gameservers"
                  aria-label="Explore our game servers and gaming community"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:game-controller" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Game Servers
                      </div>
                      <div class="community-link__subtitle">
                        Connect to our hosted game servers
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>
              </Flex>
            </Flex>
          </div>
          <div class="links-card__decoration" />
        </Card>
      </Grid>
    </section>

    <!-- Monthly Funding Progress -->
    <section class="mt-xl">
      <FundingProgress />
    </section>

    <!-- Support Section -->
    <section class="mt-l">
      <SupportCTA />
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

// Grid container for equal heights
.community-grid {
  align-items: stretch; // Ensure all grid items stretch to the same height

  @media screen and (max-width: $breakpoint-sm) {
    grid-template-columns: 1fr !important;
  }
}

// About Card Styling
.about-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
  transition: all 0.3s ease;
  height: 100%; // Fill the grid item height
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px -8px var(--color-shadow);
    border-color: var(--color-border-strong);
  }

  &__content {
    position: relative;
    z-index: 2;
    flex: 1; // Fill remaining space
    display: flex;
    flex-direction: column;
  }

  &__decoration {
    position: absolute;
    top: -50%;
    right: -20%;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, var(--color-accent-alpha) 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0.1;
    pointer-events: none;
  }
}

.about-header {
  margin-bottom: var(--space-xs);
}

.about-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--border-radius-m);
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-bg-accent-raised) 100%);
  color: white;
  flex-shrink: 0;
}

.about-description {
  color: var(--color-text-light);
  line-height: 1.6;
  font-size: var(--font-size-s);
}

.activities-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
  margin-top: var(--space-s);
}

.activity-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: var(--border-radius-s);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border-weak);
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
  transition: all 0.2s ease;

  &:hover {
    background: var(--color-bg-medium);
    border-color: var(--color-border);
  }
}

.activity-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

// Links Card Styling
.links-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
  transition: all 0.3s ease;
  height: 100%; // Fill the grid item height
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px -8px var(--color-shadow);
    border-color: var(--color-border-strong);
  }

  &__content {
    position: relative;
    z-index: 2;
    flex: 1; // Fill remaining space
    display: flex;
    flex-direction: column;
  }

  &__decoration {
    position: absolute;
    bottom: -50%;
    left: -20%;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, var(--color-accent-alpha) 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0.1;
    pointer-events: none;
  }
}

.links-header {
  margin-bottom: var(--space-xs);
}

.links-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--border-radius-m);
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-bg-accent-raised) 100%);
  color: white;
  flex-shrink: 0;
}

// Community Links Styling
.community-link {
  display: block;
  width: 100%;
  text-decoration: none;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border-weak);
  background: var(--color-bg-raised);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: var(--color-border);
    background: var(--color-bg-medium);
    transform: translateY(-1px);
    box-shadow: 0 4px 15px -4px var(--color-shadow);

    .community-link__icon {
      transform: scale(1.1);
    }

    .community-link__arrow {
      transform: translateX(4px);
      opacity: 1;
    }
  }

  &__content {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    padding: var(--space-m);
    position: relative;
    z-index: 2;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--border-radius-s);
    color: var(--color-accent);
    background: var(--color-bg-accent-weak);
    flex-shrink: 0;
    transition: all 0.3s ease;
  }

  &__text {
    flex: 1;
  }

  &__title {
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
    margin-bottom: 2px;
  }

  &__subtitle {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    line-height: 1.4;
  }

  &__arrow {
    color: var(--color-text-light);
    opacity: 0.6;
    transition: all 0.3s ease;
    flex-shrink: 0;
  }

  // Variant-specific accent colors
  &--funding {
    &:hover .community-link__icon {
      background: var(--color-success-weak);
      color: var(--color-success);
    }

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--color-success), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    &:hover::before {
      opacity: 1;
    }
  }

  &--events {
    &:hover .community-link__icon {
      background: var(--color-warning-weak);
      color: var(--color-warning);
    }

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--color-warning), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    &:hover::before {
      opacity: 1;
    }
  }

  &--gameservers {
    &:hover .community-link__icon {
      background: var(--color-info-weak);
      color: var(--color-info);
    }

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--color-info), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    &:hover::before {
      opacity: 1;
    }
  }
}
</style>
