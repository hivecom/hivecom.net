<script setup lang='ts'>
import { Button, Flex, Tab, Tabs } from '@dolanske/vui'
import '~/assets/pages/votes.scss'

const tab = ref('Active')
</script>

<template>
  <div class="route-votes">
    <Flex align-center gap="l" :style="{ marginBottom: '32px' }">
      <h1>Votes</h1>
      <Button>Create poll</Button>
    </Flex>

    <p>
      Planning a movie night? Need to decide dates for an event? <br>
      Let others vote and figure it out!
    </p>

    <ClientOnly>
      <Tabs v-model="tab">
        <Tab id="Active" label="Active" />
        <Tab id="Concluded" label="Concluded" />
      </Tabs>
    </ClientOnly>
  </div>
</template>
