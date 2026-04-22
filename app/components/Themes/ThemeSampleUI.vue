<script setup lang="ts">
import { Badge, Button, Card, Flex, Grid } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import ThemeToggle from '../Shared/ThemeToggle.vue'
import UserDisplay from '../Shared/UserDisplay.vue'

const props = defineProps<{
  compact?: boolean
}>()

const isMobile = useBreakpoint('<xs')
</script>

<template>
  <div>
    <Flex x-between y-center class="mb-s">
      <h1 v-if="!props.compact">
        Sample Theme
      </h1>

      <h3 v-else>
        Sample Theme
      </h3>

      <ThemeToggle no-text />
    </Flex>

    <p class="text-color-light text-l block" :class="[props.compact ? 'mb-m' : 'mb-xxl']">
      Make sure you get the contrast right.
      <span class="text-color-lighter text-l">
        But you can of course make it goofy, as long as it's somewhat useable.
      </span>
      <span class="text-color-lightest text-l">
        Ok bro?
      </span>
    </p>

    <Card separators class="card-bg mb-xxl" :class="props.compact ? 'mb-m' : 'mb-xxl'">
      <template #header>
        <h5 class="flex-1">
          Color details
        </h5>
      </template>
      <div class="px-m pb-m">
        <p class="mb-l">
          Generally the colors listed below represent 99% of our color coding. The same color & variation principles apply to banners as well.
        </p>

        <Flex column class="mb-l" gap="m">
          <Flex wrap>
            <Badge variant="accent" outline>
              Accent
            </Badge>
            <Badge variant="danger" outline>
              Danger
            </Badge>
            <Badge variant="info" outline>
              Informational
            </Badge>
            <Badge variant="neutral" outline>
              Neutral
            </Badge>
            <Badge variant="success" outline>
              Success
            </Badge>
            <Badge variant="warning" outline>
              Warning
            </Badge>
          </Flex>

          <Flex wrap>
            <Badge variant="accent">
              Accent
            </Badge>
            <Badge variant="danger">
              Danger
            </Badge>
            <Badge variant="info">
              Informational
            </Badge>
            <Badge variant="neutral">
              Neutral
            </Badge>
            <Badge variant="success">
              Success
            </Badge>
            <Badge variant="warning">
              Warning
            </Badge>
          </Flex>

          <Flex wrap>
            <Badge variant="accent" filled>
              Accent
            </Badge>
            <Badge variant="danger" filled>
              Danger
            </Badge>
            <Badge variant="info" filled>
              Informational
            </Badge>
            <Badge variant="neutral" filled>
              Neutral
            </Badge>
            <Badge variant="success" filled>
              Success
            </Badge>
            <Badge variant="warning" filled>
              Warning
            </Badge>
          </Flex>
        </Flex>

        <p class="text-color-lightest text-xs">
          You would be doing the community a disservice if you ended up making a theme which is just different shades of pink you know. It is heavily discourage to make the entire UI pink just sayying...
        </p>
      </div>

      <template #footer>
        <Flex x-end>
          <UserDisplay v-if="!isMobile" size="s" />
          <div class="flex-1" />
          <Button size="s">
            Cancel
          </Button>
          <Button size="s" variant="fill">
            Acknowledge
          </Button>
        </Flex>
      </template>
    </Card>

    <h4 class="mb-s">
      Backgrounds & Borders
    </h4>

    <Grid expand :columns="isMobile ? 1 : 3" class="mb-m">
      <div class="theme-example-card weak">
        <p>Weak border</p>
      </div>
      <div class="theme-example-card ">
        <p>Default border</p>
      </div>
      <div class="theme-example-card strong">
        <p>Strong border</p>
      </div>
    </Grid>

    <Grid expand :columns="isMobile ? 2 : 4" class="mb-xxl">
      <div class="theme-example-card lowered">
        <p>Lowered</p>
      </div>
      <div class="theme-example-card ">
        <p>Normal</p>
      </div>
      <div class="theme-example-card medium">
        <p>Medium</p>
      </div>
      <div class="theme-example-card raised">
        <p>Raised</p>
      </div>
    </Grid>
  </div>
</template>

<style lang="scss">
.theme-example-card {
  display: block;
  width: 100%;
  text-align: center;

  padding: var(--space-l);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  color: var(--color-text-light);

  &.weak {
    border-color: var(--color-border-weak);
    color: var(--color-text-lighter);
  }

  &.strong {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }

  &.lowered {
    background-color: var(--color-bg-lowered);
  }

  &.raised {
    background-color: var(--color-bg-raised);
  }

  &.medium {
    background-color: var(--color-bg-medium);
  }
}
</style>
