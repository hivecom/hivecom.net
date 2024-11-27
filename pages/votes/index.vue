<script setup lang='ts'>
import { Button, Card, Flex, Grid, Tab, Tabs } from '@dolanske/vui'
import '~/assets/pages/votes.scss'

useHead({
  title: 'Vote',
  htmlAttrs: {
    lang: 'en',
  },
})

const tab = ref<'Active' | 'Concluded'>('Active')
</script>

<template>
  <div class="route-votes">
    <Flex align-center gap="l" class="mb-xl">
      <h1>Votes</h1>
      <Button>Create poll</Button>
    </Flex>

    <p>
      Planning a movie night? Need to decide dates for an event? <br>
      Let others vote and figure it out!
    </p>

    <ClientOnly>
      <Tabs v-model="tab" class="my-m">
        <Tab id="Active" label="Active" />
        <Tab id="Concluded" label="Concluded" />
      </Tabs>
    </ClientOnly>

    <template v-if="tab === 'Active'">
      <Grid gap="m" :columns="2">
        <Card>
          <h2 class="text-xxl mb-m">
            Where will the next hike be?
          </h2>
          <p class="text-color-lighter">
            Idk
          </p>
        </Card>
      </Grid>
    </template>
  </div>
</template>
