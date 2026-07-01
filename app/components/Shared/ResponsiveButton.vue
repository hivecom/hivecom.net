<script setup lang="ts">
import { Button } from '@dolanske/vui'
import { computed } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'

// A toolbar button that shows an icon + label when expanded and collapses to an
// icon-only square button when collapsed. By default it collapses on the mobile
// breakpoint; pass `collapsed` to drive the state yourself (an explicit
// show-labels toggle, a different breakpoint, ...). `size` and `iconSize` mirror
// the underlying controls so a toolbar with its own sizing can adopt this
// without changing appearance. Everything else (variant, disabled, loading,
// @click, ...) falls through to the underlying VUI Button.
const props = withDefaults(defineProps<{
  icon: string
  label: string
  collapsed?: boolean
  size?: 's' | 'm' | 'l'
  iconSize?: number | null
}>(), {
  // Undefined (not false) so an unbound prop falls back to the breakpoint.
  collapsed: undefined,
  // Undefined falls through to the VUI Button's own default size.
  size: undefined,
  // Null (the default) renders the icon at its inherited size; pass a number to fix it.
  iconSize: null,
})

const isMobile = useBreakpoint('<s')
const isCollapsed = computed(() => props.collapsed ?? isMobile.value)
</script>

<template>
  <Button :size="size" :square="isCollapsed">
    <template v-if="!isCollapsed" #start>
      <Icon :name="icon" :size="iconSize ?? undefined" />
    </template>
    <Icon v-if="isCollapsed" :name="icon" :size="iconSize ?? undefined" />
    <template v-else>
      {{ label }}
    </template>
  </Button>
</template>
