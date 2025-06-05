<script setup lang='ts'>
import { Avatar, Badge, Button, Card, Flex, Grid, Input, Tab, Tabs } from '@dolanske/vui'

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
  <div class="votes-page">
    <Flex y-center gap="l" class="mb-l">
      <h1>Votes</h1>
      <NuxtLink to="/votes/create">
        <Button variant="accent">
          Create poll
        </Button>
      </NuxtLink>
    </Flex>

    <p class="text-xl mb-xl">
      Planning a movie night? Need to decide dates for an event? <br>
      Let others cast their vote and figure it out!
    </p>

    <Tabs v-model="tab" class="my-m">
      <Tab value="Active" />
      <Tab value="Concluded" />
    </Tabs>

    <Flex x-between y-center class="mb-l">
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

          <p class="text-color-light  block mb-s">
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

<style lang="scss" scoped>
.votes-page {
  min-height: 100vh;
  padding-top: 128px;

  h1 {
    position: relative;
    .vui-button {
      position: absolute;
      top: 2px;
      left: -48px;
    }
  }

  .vote-article {
    position: relative;

    &:hover {
      background-color: var(--color-bg-lowered);

      .vote-avatars .vui-avatar {
        border-color: var(--color-bg-lowered);
      }
    }

    .vote-author {
      position: absolute;
      top: var(--space-m);
      right: var(--space-m);

      a {
        color: var(--color-accent);
        font-size: var(--font-size-s);
      }
    }

    .vote-avatars {
      --avatar-offset: 12px;

      display: flex;
      gap: 4px;
      align-items: center;
      margin-left: var(--avatar-offset);

      .vui-avatar {
        margin-left: calc(var(--avatar-offset) * -1);
        margin-top: -2px;
        border: 2px solid var(--color-bg);
        z-index: 1;
      }
    }
  }

  .vote-create-choices {
    background-color: var(--color-bg-lowered);
    border-radius: var(--border-radius-m);

    ol li {
      display: flex;
      align-items: center;
      gap: var(--space-s);
      padding: 0;
      margin-bottom: var(--space-m);

      // TODO: remove when vui fixes it
      .vui-button {
        min-width: 34px;
      }

      span {
        width: 24px;
      }

      &:before {
        position: relative;
        left: unset;
      }
    }
  }
}
</style>
