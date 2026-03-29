<script lang="ts" setup>
import { DropdownItem } from '@dolanske/vui'
import UserName from '../Shared/UserName.vue'

const props = defineProps<Props>()

interface Props {
  isActive?: boolean
  data: {
    id: string | null
    name: string
    created_by: string | null
  }
}
</script>

<template>
  <DropdownItem>
    <div>
      {{ props.data.name }}
      <p class="text-xs text-color-lighter text-left">
        <UserName v-if="props.data.id" :user-id="props.data.created_by" inherit />
        <template v-else>
          System
        </template>
      </p>
    </div>
    <template v-if="props.isActive" #iconEnd>
      <Icon name="ph:circle-fill" class="text-color-accent" />
    </template>
  </DropdownItem>
</template>
