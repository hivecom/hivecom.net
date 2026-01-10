<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import GitHubLink from '@/components/Shared/GitHubLink.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useCacheProjectBanner } from '@/composables/useCacheProjectBanner'
import { getPlaceholderBannerProject } from '@/lib/placeholderBannerProjects'

interface Props {
  project: Tables<'projects'>
  compact?: boolean
  ultraCompact?: boolean
  isLatest?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  ultraCompact: false,
  isLatest: false,
})

// Handle card click
function handleClick() {
  navigateTo(`/community/projects/${props.project.id}`)
}

const { bannerUrl: projectBannerUrl } = useCacheProjectBanner(computed(() => props.project.id))

const placeholderBanner = computed(() => getPlaceholderBannerProject(props.project.id))

const hasBannerImage = computed(() => !!projectBannerUrl.value)

const bannerSurfaceStyle = computed(() => {
  const placeholder = placeholderBanner.value
  const usingPlaceholder = !projectBannerUrl.value
  const style: Record<string, string> = {
    backgroundImage: `url(${projectBannerUrl.value ?? placeholder.url})`,
  }

  if (usingPlaceholder && placeholder.transform)
    style['--banner-placeholder-transform'] = placeholder.transform

  return style
})
</script>

<template>
  <Card
    expand
    class="project-card"
    :class="{
      'project-card--compact': compact,
      'project-card--ultra-compact': ultraCompact,
    }"
    @click="handleClick"
  >
    <!-- Ultra compact layout (single line) -->
    <template v-if="ultraCompact">
      <Flex gap="xs" y-center x-between class="project-card__ultra-compact-content">
        <Flex gap="xs" y-center class="project-card__ultra-compact-main">
          <Icon name="ph:folder-fill" class="project-card__ultra-compact-icon" />
          <span class="project-card__ultra-compact-title">{{ project.title }}</span>
          <span v-if="isLatest" class="project-card__ultra-compact-latest">Latest</span>
        </Flex>
        <TimestampDate
          :date="project.created_at"
          format="MMM D"
          size="xs"
          class="project-card__ultra-compact-date"
        />
      </Flex>
    </template>

    <!-- Regular layout -->
    <div v-else class="project-card__content">
      <!-- Banner -->
      <div class="project-card__banner">
        <div
          class="project-card__banner-surface"
          :class="{
            'project-card__banner-surface--image': hasBannerImage,
          }"
          :style="bannerSurfaceStyle"
        />
        <span v-if="isLatest" class="project-card__banner-badge">Latest</span>
      </div>

      <div class="project-card__body">
        <!-- Project header -->
        <Flex expand x-between y-center>
          <h3 v-if="compact" class="project-card__title project-card__title--compact">
            {{ project.title }}
          </h3>
          <h3 v-else class="project-card__title">
            {{ project.title }}
          </h3>

          <Flex v-if="!compact" x-end>
            <TimestampDate
              :date="project.created_at"
              format="MMM D, YYYY"
              class="project-card__date"
            />
            <Icon name="ph:folder-fill" />
          </Flex>
        </Flex>

        <!-- Project description -->
        <p v-if="project.description" class="project-card__description">
          {{ project.description }}
        </p>

        <!-- Project tags and metadata row -->
        <Flex v-if="((project.tags && project.tags.length > 0) || project.github) && !compact" gap="s" x-between y-center class="project-card__tags-row">
          <Flex gap="s" y-center class="project-card__tags-left">
            <span v-if="project.github" class="project-card__github-indicator">
              <GitHubLink :github="project.github" :show-icon="true" :hide-repo="true" small />
            </span>
            <div v-if="project.tags && project.tags.length > 0" class="project-card__tags">
              <Badge v-for="tag in project.tags" :key="tag" size="xs" variant="accent">
                {{ tag }}
              </Badge>
            </div>
          </Flex>
        </Flex>
      </div>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
.project-card {
  position: relative;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid var(--color-border);
  overflow: hidden;
  width: 100%; // Ensure the card is full width
  height: 100%; // Ensure the card fills the available height
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-card);

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-accent), var(--color-accent-light));
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover {
    background-color: var(--color-bg-raised);

    &::before {
      opacity: 1;
    }

    .project-card__icon {
      transform: scale(1.1);
      color: var(--color-accent);
    }
  }

  &--compact {
    .project-card__content {
      gap: var(--space-m);
    }
  }

  &--ultra-compact {
    padding: 6px 8px; // Match button padding
    border-radius: var(--border-radius-m);
    height: 40px; // Match standard button height
    display: flex;
    align-items: center;
    flex-direction: row; // Override the column direction for ultra-compact

    &:hover {
      transform: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

  &--latest {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-l);
    background: var(--color-bg-subtle);

    &::before {
      display: none; // Remove the accent bar for latest projects
    }

    .project-card__content {
      padding: var(--space-l);
    }

    .project-card__description {
      font-size: var(--font-size-l);
      margin-top: var(--space-m);
    }

    .project-card__icon {
      width: 40px;
      height: 40px;

      svg {
        font-size: 20px;
      }
    }
  }
}

.project-card__content {
  position: relative;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-m);

  .project-card--ultra-compact & {
    flex: none;
    display: block;
  }
}

.project-card__body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  flex: 1;
}

.project-card__icon {
  position: absolute;
  top: 0;
  right: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--color-text-light);
  transition: all 0.3s ease;

  svg {
    font-size: 16px;
  }
}

.project-card__banner {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: var(--border-radius-m);
  overflow: hidden;
  background: transparent;
}

.project-card--compact .project-card__banner {
  height: 120px;
}

.project-card__banner-surface {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-size: cover;
  background-position: center;
  transform: var(--banner-placeholder-transform, scale(1));
  transition: none;
}

.project-card:hover .project-card__banner-surface--image {
  transition: transform 0.2s ease;
  transform: var(--banner-placeholder-transform, scale(1)) scale(1.05);
}

.project-card__banner-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  padding: 2px 8px;
  border-radius: var(--border-radius-s);
  font-size: var(--font-size-xxs);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.project-card__title {
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  transition: var(--transition-fast);

  .project-card:hover & {
    color: var(--color-accent);
  }

  &--compact {
    font-size: var(--font-size-xl);
  }
}

.project-card__meta {
  opacity: 0.8;
  font-size: var(--font-size-s);
  margin-top: var(--space-xs);
}

.project-card__date {
  color: var(--color-text-light);
  flex-shrink: 0; // Prevent date from shrinking
  font-size: var(--font-size-s);
}

.project-card__link-indicator {
  color: var(--color-accent);
  display: flex;
  align-items: center;
  gap: 2px;

  svg {
    font-size: var(--font-size-s);
  }
}

.project-card__tags-left {
  flex: 1;
  min-width: 0; // Allow content to shrink
}

.project-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.project-card__description {
  color: var(--color-text-light);
  line-height: 1.6;
  margin: 0;
  font-size: var(--font-size-m);

  .project-card--compact & {
    font-size: var(--font-size-s);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.project-card__ultra-compact-content {
  width: 100%;
  height: 100%;
}

.project-card__ultra-compact-main {
  flex: 1;
  min-width: 0; // Allow text to truncate
}

.project-card__ultra-compact-icon {
  color: var(--color-accent);
  font-size: var(--font-size-s); // Use CSS variable
  flex-shrink: 0;
}

.project-card__ultra-compact-title {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  line-height: 1;
}

.project-card__ultra-compact-latest {
  background: var(--color-accent);
  color: black;
  padding: 2px 4px; // Smaller padding
  border-radius: var(--border-radius-xs);
  font-size: var(--font-size-xxs); // Use CSS variable
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.2px;
  flex-shrink: 0;
  line-height: 1;
}

.project-card__ultra-compact-date {
  color: var(--color-text-light);
  font-size: var(--font-size-xs); // Use CSS variable
  flex-shrink: 0;
  line-height: 1;
}
</style>
