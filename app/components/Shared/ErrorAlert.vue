<script setup lang="ts">
import { Alert, Button, Flex } from '@dolanske/vui'
import { ref } from 'vue'

import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import SupportModal from '@/components/Shared/SupportModal.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps({
  message: {
    type: String,
    default: '',
  },
  error: {
    type: String,
    default: '',
  },
  standalone: {
    type: Boolean,
    default: false,
  },
})

const isMobile = useBreakpoint('<s')
const isXs = useBreakpoint('<xs')
const user = useSupabaseUser()

const complaintsOpen = ref(false)
const supportOpen = ref(false)
const route = useRoute()

const ERROR_INTROS = [
  `Hey, I'm encountering an error on the site.`,
  `Hi, ran into an error just now.`,
  `Getting an error on my end.`,
  `Seems like something broke.`,
  `Found a bug - there's an error popping up.`,
  `Hey, something's not working right.`,
  `I hit an error while browsing the site.`,
  `Ran into a problem on the site.`,
  `Something went wrong for me here.`,
  `There's an error showing up on my screen.`,
  `Hey - looks like something's broken.`,
  `I keep getting an error on this page.`,
  `Error popped up, wanted to flag it.`,
  `Site threw an error at me.`,
  `Bumped into an error, thought I'd report it.`,
  `Getting a weird error on my end.`,
  `Looks like something's off - error below.`,
  `Not sure if this is known but I'm seeing an error.`,
  `Flagging an error I ran into.`,
  `Hit a wall - error on the site.`,
  `Something broke while I was on this page.`,
  `Came across an error, here's the info.`,
  `There's a problem on this page.`,
  `Hey, just got an error - details below.`,
  `Reporting an error I noticed on the site.`,
]

const ERROR_FOLLOW_UPS = [
  `Not sure what triggered it.`,
  `Happened as soon as I loaded the page.`,
  `It's been consistent every time I try.`,
  `Only just started seeing this.`,
  `Tried refreshing but still getting it.`,
  `Happened out of nowhere.`,
  `First time I've seen this.`,
  `Been happening for a bit now.`,
  `Thought it might go away but it hasn't.`,
  `No idea what caused it.`,
  `Reproduced it a couple of times.`,
  `Could be related to something I did but not sure.`,
  `Just wanted to flag it in case it's not known.`,
  `Details are below if that helps track it down.`,
  `Attaching the error code below.`,
  `Error code is below for reference.`,
  `Leaving the error info below.`,
  `Might be a one-off but flagging it anyway.`,
  `Wasn't doing anything unusual when it happened.`,
  `Happy to provide more info if needed.`,
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function buildComplaintMessage() {
  return `${pick(ERROR_INTROS)} ${pick(ERROR_FOLLOW_UPS)}\n\nPage: ${route.path}\nError: ${props.error}`
}
</script>

<template>
  <!-- Standalone: centered layout for use inside cards/page sections -->
  <div v-if="props.standalone" class="error-alert-standalone">
    <Alert variant="danger" filled>
      <Flex column gap="s" x-center y-center>
        <Icon name="ph:warning-diamond" size="48" class="standalone-icon" />
        <p class="standalone-message">
          {{ props.message }}
        </p>
        <CopyValue v-if="props.error" :text="props.error" hide-icon wrap danger class="error-alert-code" />
        <Flex :column="isXs" :expand="isXs" gap="xs" y-center :class="isXs ? 'mt-xl' : ''">
          <Button v-if="user" :expand="isXs" :variant="isXs ? 'gray' : 'link'" size="s" @click="complaintsOpen = true">
            <template #start>
              <Icon name="ph:flag" />
            </template>
            Report Issue
          </Button>
          <Button :expand="isXs" :variant="isXs ? 'gray' : 'link'" size="s" @click="supportOpen = true">
            <template #start>
              <Icon name="ph:envelope-simple" />
            </template>
            Contact Support
          </Button>
        </Flex>
      </Flex>
    </Alert>
  </div>

  <!-- Mobile: stacked centered layout -->
  <Alert v-else-if="isMobile" variant="danger" filled>
    <Flex column gap="xs" x-center>
      <Icon name="ph:warning-diamond" size="32" class="standalone-icon" />
      <p class="standalone-message">
        {{ props.message }}
      </p>
      <Flex gap="xs" y-center>
        <Button v-if="user" variant="link" size="s" @click="complaintsOpen = true">
          <template #start>
            <Icon name="ph:flag" />
          </template>
          Report Issue
        </Button>
        <Button variant="link" size="s" @click="supportOpen = true">
          <template #start>
            <Icon name="ph:envelope-simple" />
          </template>
          Contact Support
        </Button>
      </Flex>
      <CopyValue v-if="props.error" :text="props.error" hide-icon wrap danger class="error-alert-code" />
    </Flex>
  </Alert>

  <!-- Desktop: side-by-side -->
  <Alert v-else variant="danger" filled>
    <Flex y-center x-between gap="s">
      <p>{{ props.message }}</p>
      <Flex gap="xs" y-center>
        <Button v-if="user" variant="link" size="s" @click="complaintsOpen = true">
          <template #start>
            <Icon name="ph:flag" />
          </template>
          Report Issue
        </Button>
        <Button variant="link" size="s" @click="supportOpen = true">
          <template #start>
            <Icon name="ph:envelope-simple" />
          </template>
          Contact Support
        </Button>
      </Flex>
    </Flex>
    <CopyValue v-if="props.error" :text="props.error" hide-icon wrap danger class="error-alert-code" />
  </Alert>

  <ComplaintsManager v-model:open="complaintsOpen" start-with-submit :initial-message="props.error ? buildComplaintMessage() : undefined" />
  <SupportModal v-model:open="supportOpen" />
</template>

<style scoped>
.error-alert-standalone {
  width: 100%;
  :deep(.vui-alert-icon) {
    display: none;
  }

  .vui-alert {
    min-height: 256px;
    background-color: var(--color-bg-card) !important;
    border: 1px solid var(--color-bg-red-lowered) !important;
  }
}

.standalone-icon {
  color: var(--color-text-red);
}

.standalone-message {
  font-weight: 600;
  text-align: center;
}

.error-alert-code {
  opacity: 0.7;
}
</style>
