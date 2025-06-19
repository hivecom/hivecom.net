<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

interface Props {
  announcement: Tables<'announcements'>
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
  navigateTo(`/announcements/${props.announcement.id}`)
}
</script>

<template>
  <Card
    class="announcement-card"
    :class="{
      'announcement-card--pinned': announcement.pinned,
      'announcement-card--compact': compact,
      'announcement-card--ultra-compact': ultraCompact,
    }"
    @click="handleClick"
  >
    <!-- Ultra compact layout (single line) -->
    <template v-if="ultraCompact">
      <Flex gap="xs" y-center x-between class="announcement-card__ultra-compact-content">
        <Flex gap="xs" y-center class="announcement-card__ultra-compact-main">
          <Icon v-if="announcement.pinned" name="ph:push-pin-fill" class="announcement-card__ultra-compact-icon" />
          <Icon v-else name="ph:megaphone-fill" class="announcement-card__ultra-compact-icon" />
          <span class="announcement-card__ultra-compact-title">{{ announcement.title }}</span>
          <span v-if="isLatest" class="announcement-card__ultra-compact-latest">Latest</span>
        </Flex>
        <TimestampDate
          :date="announcement.created_at"
          format="MMM D"
          size="xs"
          class="announcement-card__ultra-compact-date"
        />
      </Flex>
    </template>

    <!-- Regular layout -->
    <div v-else class="announcement-card__content">
      <!-- Announcement icon -->
      <div class="announcement-card__icon">
        <Icon v-if="announcement.pinned" name="ph:push-pin-fill" />
        <Icon v-else name="ph:megaphone-fill" />
      </div>

      <!-- Announcement header -->
      <div class="announcement-card__header">
        <h3 class="announcement-card__title">
          {{ announcement.title }}
        </h3>

        <Flex gap="s" y-center class="announcement-card__meta">
          <TimestampDate
            :date="announcement.created_at"
            format="MMM D, YYYY"
            class="announcement-card__date"
          />
          <span v-if="announcement.link" class="announcement-card__link-indicator">
            <Icon name="ph:link" />
          </span>
        </Flex>
      </div>      <!-- Announcement description -->
      <p v-if="announcement.description && !compact" class="announcement-card__description">
        {{ announcement.description }}
      </p>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
.announcement-card {
  position: relative;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid var(--color-border);
  overflow: hidden;
  height: 100%; // Ensure the card fills the available height
  display: flex;
  flex-direction: column;

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
    border-color: var(--color-accent-light);
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);

    &::before {
      opacity: 1;
    }

    .announcement-card__icon {
      transform: scale(1.1);
      color: var(--color-accent);
    }
  }

  &--pinned {
    border-color: var(--color-accent);
    background: linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.03) 0%, transparent 100%);

    &::before {
      opacity: 1;
    }

    .announcement-card__icon {
      color: var(--color-accent);
    }
  }

  &--compact {
    .announcement-card__description {
      display: none;
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
}

.announcement-card__content {
  position: relative;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  .announcement-card--ultra-compact & {
    flex: none;
    display: block;
  }
}

.announcement-card__latest-text {
  text-align: center;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-accent);
  margin-top: var(--space-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
}

.announcement-card__icon {
  position: absolute;
  top: 0;
  right: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--color-accent-rgb), 0.1);
  color: var(--color-text-light);
  transition: all 0.3s ease;

  svg {
    font-size: 16px;
  }
}

.announcement-card__header {
  margin-bottom: var(--space-s);
}

.announcement-card__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0 32px 0 0; // Add right margin for icon space
  line-height: 1.3;
  transition: color 0.2s ease;

  .announcement-card:hover & {
    color: var(--color-accent);
  }
}

.announcement-card__meta {
  opacity: 0.8;
  font-size: var(--font-size-s);
  margin-top: var(--space-xs);
}

.announcement-card__date {
  color: var(--color-text-light);
}

.announcement-card__link-indicator {
  color: var(--color-accent);
  display: flex;
  align-items: center;

  svg {
    font-size: var(--font-size-s);
  }
}

.announcement-card__description {
  color: var(--color-text-light);
  line-height: 1.6;
  margin: 0;
  font-size: var(--font-size-m);
  margin-top: var(--space-s); // Add consistent top margin
}

.announcement-card__ultra-compact-content {
  width: 100%;
  height: 100%;
}

.announcement-card__ultra-compact-main {
  flex: 1;
  min-width: 0; // Allow text to truncate
}

.announcement-card__ultra-compact-icon {
  color: var(--color-accent);
  font-size: var(--font-size-s); // Use CSS variable
  flex-shrink: 0;
}

.announcement-card__ultra-compact-title {
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

.announcement-card__ultra-compact-latest {
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

.announcement-card__ultra-compact-date {
  color: var(--color-text-light);
  font-size: var(--font-size-xs); // Use CSS variable
  flex-shrink: 0;
  line-height: 1;
}
</style>
