<script setup lang="ts">
import type { TeamSpeakNormalizedClient, TeamSpeakServerSnapshot } from '@/types/teamspeak'
import { Avatar, Badge, Flex, Grid, Modal, Skeleton } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { SNAPSHOT_BUCKET } from '@/composables/useDataTeamSpeakSnapshot'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getCountryEmoji, getCountryName } from '@/lib/utils/country'
import { formatDuration } from '@/lib/utils/duration'

const props = defineProps<{
  client: TeamSpeakNormalizedClient | null
  channelLabel?: string | null
  role?: string | null

  /** Hivecom profile linked to this TeamSpeak identity, if any. */
  userId?: string | null

  /** The server the client is on, for its group names. */
  server?: TeamSpeakServerSnapshot | null

  /** A fresh snapshot is on its way, which may bring the avatar with it. */
  refreshing?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const isMobile = useBreakpoint('<s')

const groups = computed(() => {
  const serverGroupIds = props.client?.serverGroups ?? []
  const serverGroups = (props.server?.serverGroups ?? []).filter(group => serverGroupIds.includes(group.id))

  // Nearly everyone sits in the default channel group, so it says nothing.
  const channelGroupId = props.client?.channelGroupId
  const channelGroup = channelGroupId !== props.server?.serverInfo?.defaultChannelGroupId
    ? props.server?.channelGroups?.find(group => group.id === channelGroupId)
    : undefined

  return channelGroup ? [...serverGroups, channelGroup] : serverGroups
})

const countryName = computed(() => getCountryName(props.client?.country) ?? props.client?.country ?? null)

// The query reports connection times as unix seconds.
function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds <= 0)
    return null

  return new Date(seconds * 1000).toISOString()
}

// The session length is as of the snapshot, so anchor it there to get a
// start time that keeps ticking.
const connectedAt = computed(() => {
  const connectedMs = props.client?.connectedTimeMs
  const collectedAt = Date.parse(props.server?.collectedAt ?? '')
  if (connectedMs === null || connectedMs === undefined || Number.isNaN(collectedAt))
    return null

  return new Date(collectedAt - connectedMs).toISOString()
})

const firstSeenAt = computed(() => unixToIso(props.client?.createdAt))
const idleLabel = computed(() => formatDuration(props.client?.idleTimeMs ?? null))

const supabase = useSupabaseClient()

const avatarUrl = computed(() => {
  const avatar = props.client?.avatar
  if (!avatar)
    return null

  const { data } = supabase.storage.from(SNAPSHOT_BUCKET).getPublicUrl(avatar.path)
  return `${data.publicUrl}?v=${avatar.hash}`
})

const AVATAR_SIZE = 96

// Preload the image so the slot holds a skeleton until it can paint whole,
// rather than an empty frame filling in.
const avatarReady = ref(false)
const avatarFailed = ref(false)

watch(avatarUrl, (url) => {
  avatarReady.value = false
  avatarFailed.value = false

  if (!url || !import.meta.client)
    return

  const image = new Image()
  image.onload = () => {
    if (avatarUrl.value === url)
      avatarReady.value = true
  }
  image.onerror = () => {
    if (avatarUrl.value === url)
      avatarFailed.value = true
  }
  image.src = url
}, { immediate: true })

const avatarLoading = computed(() => {
  if (avatarUrl.value)
    return !avatarReady.value && !avatarFailed.value

  return props.refreshing
})
</script>

<template>
  <Modal
    :open="open"
    centered
    :can-dismiss="true"
    :size="isMobile ? 'screen' : 's'"
    @close="open = false"
  >
    <template #header>
      <Flex y-center gap="s">
        <span v-if="getCountryEmoji(client?.country)" class="text-xl">{{ getCountryEmoji(client?.country) }}</span>
        <h4>{{ client?.nickname ?? 'TeamSpeak user' }}</h4>
        <RoleIndicator v-if="role" :role size="s" />
      </Flex>
    </template>

    <Flex v-if="client" column gap="l">
      <Flex gap="m">
        <Avatar
          v-if="avatarUrl && avatarReady"
          :size="AVATAR_SIZE"
          :url="avatarUrl"
          radius="m"
          :alt="`${client.nickname} TeamSpeak avatar`"
        />
        <Skeleton v-else-if="avatarLoading" class="ts-client__avatar-skeleton" :width="AVATAR_SIZE" :height="AVATAR_SIZE" :radius="8" />
        <Avatar v-else :size="AVATAR_SIZE" radius="m">
          <template #icon>
            <Icon name="ph:user" :size="40" />
          </template>
        </Avatar>

        <Flex column gap="s" expand>
          <Flex v-if="userId" y-center gap="xs">
            <UserAvatar :user-id="userId" size="s" linked show-preview />
            <UserLink :user-id="userId" :placeholder="client.nickname" />
          </Flex>

          <Flex v-if="groups.length" wrap gap="xs">
            <Badge v-for="group in groups" :key="`${group.id}-${group.name}`" variant="neutral">
              {{ group.name }}
            </Badge>
          </Flex>

          <p v-if="client.description" class="text-color-light">
            {{ client.description }}
          </p>
        </Flex>
      </Flex>

      <Grid columns="auto 1fr" gap="xs">
        <template v-if="channelLabel">
          <span class="text-s text-color-light">Channel</span>
          <span class="text-s">{{ channelLabel }}</span>
        </template>

        <template v-if="countryName">
          <span class="text-s text-color-light">Country</span>
          <span class="text-s">{{ countryName }}</span>
        </template>

        <template v-if="connectedAt">
          <span class="text-s text-color-light">Connected</span>
          <TimestampDate :date="connectedAt" relative />
        </template>

        <template v-if="idleLabel">
          <span class="text-s text-color-light">Idle</span>
          <span class="text-s">{{ idleLabel }}</span>
        </template>

        <template v-if="client.totalConnections">
          <span class="text-s text-color-light">Total connections</span>
          <span class="text-s">{{ client.totalConnections.toLocaleString() }}</span>
        </template>

        <template v-if="firstSeenAt">
          <span class="text-s text-color-light">First seen</span>
          <TimestampDate :date="firstSeenAt" type="displayDate" />
        </template>

        <template v-if="client.version">
          <span class="text-s text-color-light">Version</span>
          <span class="text-s">{{ client.version }}</span>
        </template>

        <template v-if="client.platform">
          <span class="text-s text-color-light">Platform</span>
          <span class="text-s">{{ client.platform }}</span>
        </template>
      </Grid>
    </Flex>
  </Modal>
</template>

<style scoped lang="scss">
// vui's Avatar won't shrink in a row, but its Skeleton will.
.ts-client__avatar-skeleton {
  flex-shrink: 0;
}
</style>
