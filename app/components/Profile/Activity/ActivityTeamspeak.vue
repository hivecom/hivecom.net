<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Flex, Tooltip } from '@dolanske/vui'
import RichPresenceTeamSpeak from '@/components/Profile/RichPresenceTeamSpeak.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import { normalizeTeamSpeakIdentities } from '@/lib/teamspeak'

interface Props {
  profileId: string
  teamspeakIdentities: Tables<'profiles'>['teamspeak_identities'] | TeamSpeakIdentityRecord[] | null
  isOwnProfile?: boolean
  richPresenceDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  richPresenceDisabled: false,
})

const ONLINE_WINDOW_MS = 15 * 60 * 1000
const SPACER_PATTERN = /^\[spacer\d+\]/i

function sanitizeChannelSegment(segment: string | null | undefined): string | null {
  if (!segment)
    return null

  const cleaned = segment.replace(SPACER_PATTERN, '').trim()
  return cleaned.length ? cleaned : null
}

function buildChannelPath(row: { channel_path: string[] | null, channel_name: string | null }): string {
  const cleanedPath = row.channel_path
    ?.map(sanitizeChannelSegment)
    .filter((segment): segment is string => Boolean(segment))

  if (cleanedPath?.length)
    return cleanedPath.join(' / ')

  const cleanedName = sanitizeChannelSegment(row.channel_name)
  return cleanedName || 'Unknown channel'
}

// Normalized identities
const normalizedIdentities = computed<TeamSpeakIdentityRecord[]>(() =>
  normalizeTeamSpeakIdentities(props.teamspeakIdentities),
)
const hasIdentities = computed(() => normalizedIdentities.value.length > 0)

const supabase = useSupabaseClient()

// Define a simpler interface for presence data to avoid deep type issues
interface TeamspeakPresenceData {
  id: string
  profile_id: string
  server_id: string | null
  channel_id: string | null
  channel_name: string | null
  channel_path: string[] | null
  last_seen_at: string | null
  updated_at: string | null
}

const presenceList = ref<TeamspeakPresenceData[]>([])
const loading = ref(true)

// Fetch presence data
async function fetchPresence() {
  if (props.richPresenceDisabled || !hasIdentities.value) {
    loading.value = false
    return
  }

  try {
    const { data, error } = await supabase
      .from('presences_teamspeak')
      .select('*')
      .eq('profile_id', props.profileId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching TeamSpeak presence:', error)
    }

    presenceList.value = (data ?? []) as TeamspeakPresenceData[]
  }
  catch (err) {
    console.error('Error fetching TeamSpeak presence:', err)
  }
  finally {
    loading.value = false
  }
}

interface PresenceEntry {
  id: string
  channelId: string | null
  serverId: string | null
  serverLabel: string
  region: 'eu' | 'na' | 'all' | undefined
  channelPath: string
  lastSeenAt: string | null
  online: boolean
}

function mapPresenceRow(row: TeamspeakPresenceData, now: number): PresenceEntry {
  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : null
  const online = lastSeenMs ? now - lastSeenMs <= ONLINE_WINDOW_MS : false
  const path = buildChannelPath(row)
  const region = row.server_id?.toLowerCase() as 'eu' | 'na' | 'all' | undefined
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    serverLabel: row.server_id?.toUpperCase() ?? 'UNKNOWN',
    region,
    channelPath: path,
    lastSeenAt: row.last_seen_at,
    online,
  }
}

// Process presence entries
const presenceEntries = computed<PresenceEntry[]>(() => {
  const now = Date.now()
  const rows = presenceList.value
  const entries: PresenceEntry[] = []
  for (const row of rows) {
    entries.push(mapPresenceRow(row, now))
  }
  return entries
})

const hasPresence = computed(() => presenceEntries.value.length > 0)

// Find the first online presence entry (for display)
const activePresence = computed(() => presenceEntries.value.find(entry => entry.online))

// Any user is online?
const isOnline = computed(() => presenceEntries.value.some(entry => entry.online))

// Should we show the activity card?
const shouldShow = computed(() => hasIdentities.value)

// Format last seen time
function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt)
    return 'Unknown'

  const date = new Date(lastSeenAt)
  if (Number.isNaN(date.getTime()))
    return 'Unknown'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1)
    return 'Just now'
  if (diffMins < 60)
    return `${diffMins}m ago`
  if (diffHours < 24)
    return `${diffHours}h ago`
  if (diffDays < 7)
    return `${diffDays}d ago`

  return date.toLocaleDateString()
}

// Last seen formatted for the most recent entry
const lastSeenFormatted = computed(() => {
  if (!presenceEntries.value.length)
    return null
  return formatLastSeen(presenceEntries.value[0]?.lastSeenAt ?? null)
})

// Status color
const statusColor = computed(() => {
  if (isOnline.value)
    return 'var(--color-text-green)'
  return 'var(--color-text-lighter)'
})

// Fetch on mount
onMounted(() => {
  fetchPresence()
})

// Watch for profile changes
watch(() => props.profileId, () => {
  loading.value = true
  presenceList.value = []
  fetchPresence()
})
</script>

<template>
  <div v-if="shouldShow" class="activity-item">
    <Flex y-center x-between gap="s">
      <!-- Loading state -->
      <template v-if="loading">
        <div>
          <span class="activity-item__label">
            <RichPresenceTeamSpeak
              class="activity-item__icon"
              :profile-id="props.profileId"
              :teamspeak-identities="props.teamspeakIdentities"
              :rich-presence-disabled="props.richPresenceDisabled"
              :icon-size="13"
              hide-online-indicator
              use-accent-color
            />
            Loading...
          </span>
          <strong class="activity-item__title">—</strong>
        </div>
      </template>

      <!-- Online with presence data -->
      <template v-else-if="isOnline && activePresence">
        <div>
          <span class="activity-item__label">
            <RichPresenceTeamSpeak
              class="activity-item__icon"
              :profile-id="props.profileId"
              :teamspeak-identities="props.teamspeakIdentities"
              :rich-presence-disabled="props.richPresenceDisabled"
              :icon-size="13"
              hide-online-indicator
              use-accent-color
            />
            Voice
          </span>
          <strong class="activity-item__title">
            <span
              class="activity-item__status-dot"
              :style="{ backgroundColor: statusColor }"
            />
            {{ activePresence.channelPath }}
          </strong>
        </div>

        <RegionIndicator
          v-if="activePresence.region"
          size="xxl"
          :region="activePresence.region"
          :show-label="false"
        />
      </template>

      <!-- Offline or no presence data -->
      <template v-else>
        <div>
          <span class="activity-item__label">
            <RichPresenceTeamSpeak
              class="activity-item__icon"
              :profile-id="props.profileId"
              :teamspeak-identities="props.teamspeakIdentities"
              :rich-presence-disabled="props.richPresenceDisabled"
              :icon-size="13"
              hide-online-indicator
              use-accent-color
            />
            TeamSpeak
          </span>
          <strong class="activity-item__title">
            <Tooltip v-if="lastSeenFormatted && hasPresence" position="top">
              <template #tooltip>
                Last seen {{ lastSeenFormatted }}
              </template>
              <span
                class="activity-item__status-dot"
                :style="{ backgroundColor: statusColor }"
              />
            </Tooltip>
            <span
              v-else
              class="activity-item__status-dot"
              :style="{ backgroundColor: statusColor }"
            />
            <template v-if="hasPresence">Offline</template>
            <template v-else>No recent activity</template>
          </strong>
        </div>
      </template>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.activity-item__status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
</style>
