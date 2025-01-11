<script setup lang='ts'>
import { Button, Calendar, Checkbox, Divider, Flex, Grid, Input, Textarea } from '@dolanske/vui'
import dayjs from 'dayjs'

definePageMeta({
  // middleware: 'auth',
})

const form = reactive({
  title: '',
  description: '',
  date_start: dayjs().format(dateFormat.calendarDefault),
  date_end: dayjs().add(1, 'day').format(dateFormat.calendarDefault),
  multiple_choice: false,
})

function resetForm() {
  Object.assign(form, {
    title: '',
    description: '',
    date_start: dayjs().format(dateFormat.calendarDefault),
    date_end: dayjs().add(1, 'day').format(dateFormat.calendarDefault),
    multiple_choice: false,
  })
}
</script>

<template>
  <div class="route-votes">
    <h1 class="mb-l">
      Start a vote
    </h1>
    <p class="mb-xxl">
      To avoid any confusion about your events, make sure you get all the important details listed.
    </p>

    <Grid columns="1fr 2fr" gap="m" class="mb-xl">
      <Flex column gap="m">
        <Input
          v-model="form.title"
          expand
          label="Name"
          placeholder="We watching a movie..."
        />
        <Textarea
          v-model="form.description"
          label="Description"
          expand
          :resize="false"
          placeholder="So there's this big green guy living a swamp..."
        />
        <p class="text-size-m text-color-light">
          Please choose timeframe in which the votes should be accepted. No starting date will start the vote immediately.
        </p>
        <Flex gap="xs" expand>
          <Calendar v-model="form.date_start" expand>
            <template #trigger>
              <Button expand>
                <template #start>
                  <Icon name="ph:calendar-dot" />
                </template>
                {{ dayjs(form.date_start).format(dateFormat.display) }}
              </Button>
            </template>
          </Calendar>

          <Icon name="ph:arrow-right" size="3rem" />

          <Calendar v-model="form.date_end" expand>
            <template #trigger>
              <Button expand>
                <template #start>
                  <Icon name="ph:calendar-dots" />
                </template>
                {{ dayjs(form.date_end).format(dateFormat.display) }}
              </Button>
            </template>
          </Calendar>
        </Flex>
        <Checkbox v-model="form.multiple_choice" label="Allow multiple answers per person" />
      </Flex>

      <div class="vote-create-choices" />
    </Grid>

    <Divider size="32" />

    <Flex justify-end gap="s">
      <Button @click="resetForm">
        Reset
      </Button>
      <Button variant="accent">
        Create
      </Button>
    </Flex>
  </div>
</template>
