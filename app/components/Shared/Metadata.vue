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
  showSystemUserForMissingCreatedBy?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSystemUserForMissingCreatedBy: false,
})

const showCreatedUser = computed(() => {
  return !!(props.createdBy || props.showSystemUserForMissingCreatedBy)
})

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
      <Flex column gap="xs" class="metadata-col">
        <span class="text-xxs text-color-lighter" style="text-transform: uppercase; letter-spacing: 0.5px;">
          Created
        </span>
        <TimestampDate size="xs" :date="createdAt" type="fullDateTime" />
        <UserDisplay
          v-if="showCreatedUser"
          class="mt-xs"
          :user-id="createdBy"
          show-role
          size="s"
        />
      </Flex>

      <Flex v-if="modifiedAt" column gap="xs" class="metadata-col">
        <span class="text-xxs text-color-lighter" style="text-transform: uppercase; letter-spacing: 0.5px;">
          Modified
        </span>
        <TimestampDate size="xs" :date="modifiedAt" type="fullDateTime" />
        <UserDisplay
          v-if="showModifiedUser"
          class="mt-xs"
          :user-id="modifiedBy"
          show-role
          size="s"
        />
      </Flex>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.metadata-col {
  min-width: 160px;
}
</style>
