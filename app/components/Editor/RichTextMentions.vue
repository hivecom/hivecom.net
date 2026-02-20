<script setup lang="ts">
import type { SuggestionProps } from '@tiptap/suggestion'
import { Button, Flex } from '@dolanske/vui'
import UserAvatar from '../Shared/UserAvatar.vue'

export interface RichTextEmote {
  username: string
  id: string
}

const props = defineProps<SuggestionProps<RichTextEmote>>()

const selectedIndex = ref(0)

// Reset index when items change
watch(() => props.items, () => {
  selectedIndex.value = 0
}, { deep: true, immediate: true })

defineExpose({
  onKeyDown: ({ event }: { event: KeyboardEvent }) => {
    if (event.key === 'ArrowUp') {
      selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
      return true
    }

    if (event.key === 'ArrowDown') {
      selectedIndex.value = (selectedIndex.value + 1) % props.items.length
      return true
    }

    if (event.key === 'Enter') {
      selectItem(selectedIndex.value)
      return true
    }

    return true
  },
})

function selectItem(index: number) {
  const selectedItem = props.items[index]

  if (selectedItem) {
    props.command({
      id: selectedItem.id,
      label: selectedItem.username,
    })
  }
}

const query = toRef(props, 'query')
</script>

<template>
  <div v-show="query !== null" class="rich-text-mention-menu">
    <span class="block mb-xxs text-xs text-color-lighter">People</span>
    <Button
      v-for="(item, index) in props.items"
      :key="item.username"
      :plain="index !== selectedIndex"
      size="s"
      expand
      @click="selectItem(index)"
    >
      <template #start>
        <Flex y-center :gap="4">
          <UserAvatar :user-id="item.id" :size="22" />
          {{ item.username }}
        </Flex>
      </template>
    </Button>
    <p v-if="props.items.length === 0" class="text-s">
      No results
    </p>
  </div>
</template>

<style scoped lang="scss">
.rich-text-mention-menu {
  display: flex;
  gap: 2px;
  flex-direction: column;
  max-height: 512px;
  overflow-y: auto;
}
</style>
