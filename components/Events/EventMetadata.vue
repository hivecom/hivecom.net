<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import Metadata from '~/components/Shared/Metadata.vue'

interface Props {
  event: Tables<'events'>
}

const props = defineProps<Props>()
</script>

<template>
  <Metadata
    :created-at="props.event.created_at"
    :created-by="props.event.created_by"
    :modified-at="props.event.modified_at"
    :modified-by="props.event.modified_by"
  />
</template>
