<script setup lang="ts">
import { Badge, Card, Flex } from '@dolanske/vui'
import ChartActivityHistogram from '../Shared/Charts/ChartActivityHistogram.vue'

interface Props {
  id: number
}

const props = defineProps<Props>()

// Expecting a Tuple<14> here
const data = shallowRef<number[]>([])

onBeforeMount(() => {
  // Here we'd fetch that shi
  data.value = [
    0,
    0,
    4,
    2,
    0,
    4,
    7,
    1,
    0,
    0,
    0,
    5,
    4,
    6,
  ]
})
</script>

<template>
  <Card>
    <Flex x-between y-center>
      <Flex gap="s" y-center>
        <Badge variant="success">
          <Icon name="ph:circle-fill" />
          Activity
        </Badge>
        <p class="text-m">
          2 playeres online on <strong>hns_poolparty</strong>
        </p>
      </Flex>

      <ChartActivityHistogram :data :height="32">
        <template #tooltip="{ value }">
          <p>{{ value }} players</p>
        </template>
      </ChartActivityHistogram>
    </Flex>
  </Card>
</template>
