<script setup lang="ts">
import { Badge, Button, Card, Flex, Progress } from '@dolanske/vui'

const funding = 67
const fundingUserCut = 4
const fundingUsers = ['dolanske', 'Zealsprince', 'Felix', 'Yuki', 'Jokler', 'Joeffrey Watkins']
</script>

<template>
  <Card>
    <Flex y-center x-between class="mb-s">
      <Flex y-center>
        <strong class="block text-bold text-l">Funding</strong>
        <Button size="s" outline>
          Learn more
          <template #end>
            <Icon name="ph:caret-right" />
          </template>
        </Button>
      </Flex>
      <Flex>
        <strong class="text-bold">$251</strong>
        /
        <strong class="color-text-light">$400</strong>
      </Flex>
    </Flex>
    <Progress class="mb-s" :height="8" :model-value="funding" />

    <Flex y-center x-end gap="xs">
      <Badge v-for="user in fundingUsers.slice(0, fundingUserCut)" :key="user" variant="accent">
        <Icon name="ph:user-circle" size="1.6rem" />
        {{ user }}
      </Badge>
      <Badge variant="accent">
        +{{ fundingUsers.slice(fundingUserCut).length }} contributors
      </Badge>
    </Flex>
  </Card>
</template>
