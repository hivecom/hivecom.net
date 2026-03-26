<script setup lang="ts">
import { BreadcrumbItem, Breadcrumbs } from '@dolanske/vui'

export interface ForumBreadcrumbItem {
  id: string
  label: string
  href?: string
  onClick?: () => void
  onMiddleClick?: () => void
}

const props = defineProps<{
  items: ForumBreadcrumbItem[]
  icons?: Map<string, string | null>
  rootHref?: string
  onRootClick?: () => void
  onRootMiddleClick?: () => void
}>()
</script>

<template>
  <div class="forum-breadcrumbs">
    <Breadcrumbs>
      <BreadcrumbItem
        :href="props.rootHref ?? '/forum'"
        @click.prevent="props.onRootClick ? props.onRootClick() : undefined"
        @mousedown.middle.prevent="props.onRootMiddleClick ? props.onRootMiddleClick() : undefined"
      >
        Forum
      </BreadcrumbItem>
      <BreadcrumbItem
        v-for="item in props.items"
        :key="item.id"
        :href="item.href"
        @click.prevent="item.onClick ? item.onClick() : undefined"
        @mousedown.middle.prevent="item.onMiddleClick ? item.onMiddleClick() : undefined"
      >
        <span class="forum-breadcrumbs__label">
          <img
            v-if="props.icons?.get(item.id)"
            :src="props.icons.get(item.id)!"
            :alt="`${item.label} icon`"
            class="forum-breadcrumbs__icon"
          >{{ item.label }}</span>
      </BreadcrumbItem>
    </Breadcrumbs>
  </div>
</template>

<style scoped lang="scss">
.forum-breadcrumbs {
  display: flex;
  align-items: center;
}

.forum-breadcrumbs__label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  vertical-align: middle;
  // Inherit font and color from the VUI BreadcrumbItem anchor so this span
  // looks identical to plain-text breadcrumb items.
  font: inherit;
  color: inherit;
}

.forum-breadcrumbs__icon {
  width: 20px;
  height: 20px;
  border-radius: var(--border-radius-xs);
  object-fit: cover;
  flex-shrink: 0;
}
</style>
