<script setup lang="ts">
import { Button, Card, Flex, removeToast } from '@dolanske/vui'
import { useRouter } from 'vue-router'

interface Props {
  data: {
    title: string
    onNext: (toastId: number) => void
  }
  toastId: number
}

const { data, toastId } = defineProps<Props>()

const router = useRouter()

// Wait a tick so the navigation that opened this toast has settled,
// then close on the next route change
await nextTick()
const unregister = router.afterEach(() => {
  unregister()
  removeToast(toastId)
})

onUnmounted(() => unregister())
</script>

<template>
  <Card :padding="false" expand class="toast-discover">
    <Flex y-center gap="s" class="toast-discover__row">
      <Flex y-center x-center class="toast-discover__icon">
        <Icon name="ph:shuffle" :size="20" />
      </Flex>
      <Flex column expand gap="xxs" class="toast-discover__text">
        <span class="toast-discover__label">Random discussion</span>
        <span class="toast-discover__title">{{ data.title }}</span>
      </Flex>
      <Flex gap="xs" y-center>
        <Button size="s" variant="accent" @click="() => data.onNext(toastId)">
          Next
        </Button>
        <Button size="s" variant="gray" square @click="() => removeToast(toastId)">
          <Icon name="ph:x" :size="14" />
        </Button>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped lang="scss">
.toast-discover {
  &__row {
    padding-inline: var(--space-xs);
    min-height: 52px;
  }

  &__icon {
    width: 32px;
    height: 32px;
    min-width: 32px;
    background-color: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    border: 1px solid var(--color-border);
    color: var(--color-text-light);
    flex-shrink: 0;
  }

  &__text {
    min-width: 0;
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__title {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
