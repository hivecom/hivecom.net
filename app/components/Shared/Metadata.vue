<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

interface Props {
  createdAt: string
  createdBy?: string | null
  modifiedAt?: string | null
  modifiedBy?: string | null
  loading?: boolean
}

const props = defineProps<Props>()

const showModifiedUser = computed(() => {
  return !!props.modifiedBy && props.modifiedBy !== props.createdBy
})
</script>

<template>
  <Flex column gap="m" expand>
    <Flex v-if="loading" column gap="s">
      <Skeleton height="16px" width="100%" />
      <Skeleton height="16px" width="60%" />
    </Flex>

    <Flex v-else wrap gap="m" expand>
      <Flex column gap="xs">
        <span class="text-xxs text-color-lighter" style="text-transform: uppercase; letter-spacing: 0.5px;">
          Created
        </span>
        <TimestampDate size="xs" :date="createdAt" format="MMM D, YYYY [at] HH:mm" />
        <UserDisplay v-if="createdBy" class="mt-xs" :user-id="createdBy" show-role size="s" />
      </Flex>

      <Flex v-if="modifiedAt" column gap="xs">
        <span class="text-xxs text-color-lighter" style="text-transform: uppercase; letter-spacing: 0.5px;">
          Modified
        </span>
        <TimestampDate size="xs" :date="modifiedAt" format="MMM D, YYYY [at] HH:mm" />
        <UserDisplay v-if="showModifiedUser" class="mt-xs" :user-id="modifiedBy" show-role size="s" />
      </Flex>
    </Flex>
  </Flex>
</template>
