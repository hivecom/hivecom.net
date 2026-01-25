<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Divider, Dropdown, DropdownItem } from '@dolanske/vui'

// discussion_topics -> archive, lock
// discussions -> sticky, lock

// TODO: should this same menu be attached to forum discussion panel?

interface Props {
  type: 'topic' | 'discussion'
  data: Tables<'discussions'> | Tables<'discussion_topics'>
}

const props = defineProps<Props>()

function handleLock() {}

function handleArchive() {}

function handleEdit() {}

function handleDelete() {}
</script>

<template>
  <div class="forum__item-actions">
    <Dropdown>
      <template #trigger="{ toggle, isOpen }">
        <Button size="s" plain square :class="{ 'has-active-dropdown': isOpen }" @click.stop.prevent="toggle">
          <Icon name="ph:dots-three-outline-fill" />
        </Button>
      </template>
      <DropdownItem v-if="props.type === 'discussion'">
        Sticky
      </DropdownItem>
      <DropdownItem>Lock</DropdownItem>
      <DropdownItem v-if="props.type === 'topic'">
        Archive
      </DropdownItem>
      <Divider :size="0" margin="8px 0" />
      <DropdownItem>Edit</DropdownItem>
      <DropdownItem>Delete</DropdownItem>
    </Dropdown>
  </div>
</template>
