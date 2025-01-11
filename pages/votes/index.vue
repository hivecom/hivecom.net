<script setup lang='ts'>
import { Avatar, Badge, Button, Card, Flex, Grid, Input, Tab, Tabs } from '@dolanske/vui'
import '~/assets/pages/votes.scss'

useHead({
  title: 'Vote',
  htmlAttrs: {
    lang: 'en',
  },
})

const tab = ref<'Active' | 'Concluded'>('Active')
const search = ref('')
</script>

<template>
  <div class="route-votes">
    <Flex align-center gap="l" class="mb-xl">
      <h1>Votes</h1>
      <NuxtLink to="/votes/create">
        <Button variant="accent">
          Create poll
        </Button>
      </NuxtLink>
    </Flex>

    <p>
      Planning a movie night? Need to decide dates for an event? <br>
      Let others vote and figure it out!
    </p>

    <Tabs v-model="tab" class="my-m">
      <Tab id="Active" label="Active" />
      <Tab id="Concluded" label="Concluded" />
    </Tabs>

    <Flex space-between align-center class="mb-l">
      <Input v-model="search" placeholder="Search items..." type="search">
        <template #start>
          <Icon name="ph:magnifying-glass" />
        </template>
      </Input>
      <span class="text-s text-color-lighter">3 results</span>
    </Flex>

    <template v-if="tab === 'Active'">
      <Grid gap="m" :columns="2">
        <Card class="vote-article" role="button">
          <h2 class="text-xxl mb-m">
            Where will the next hike be?
          </h2>

          <p class="text-color-lighter  block mb-s">
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Explicabo dignissimos enim sequi error facere blanditiis ratione exercitationem beatae magnam illo neque sed, aut deleniti repellendus autem nesciunt? Tempore, perferendis asperiores.
          </p>

          <span class="vote-author">
            by <a href="" class="link-line" @click.prevent="">@Rapid</a>
          </span>

          <Flex gap="xs">
            <Badge variant="info">
              3 days left
            </Badge>
            <Badge>Multichoice</Badge>

            <div class="vote-avatars">
              <Avatar :size="30" />
              <Avatar :size="30" />
              <Avatar :size="30" />
              <span class="font-size-s">+3</span>
            </div>
          </Flex>
        </Card>
      </Grid>
    </template>
  </div>
</template>
