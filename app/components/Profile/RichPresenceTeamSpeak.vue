<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Badge, Button, Divider, Flex, Popout } from '@dolanske/vui'
import { computed, ref } from 'vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import { normalizeTeamSpeakIdentities } from '@/lib/teamspeak'

type PresenceRow = Tables<'presences_teamspeak'>

interface Props {
  profileId: string
  teamspeakIdentities: Tables<'profiles'>['teamspeak_identities'] | TeamSpeakIdentityRecord[] | null
  richPresenceEnabled?: boolean
  hideOnlineIndicator?: boolean
  iconSize?: number
  useAccentColor?: boolean
  /** When provided, skips the internal fetch and uses this data directly. */
  presences?: PresenceRow[] | null
}

const props = withDefaults(defineProps<Props>(), {
  richPresenceEnabled: false,
  hideOnlineIndicator: false,
  iconSize: 18,
  useAccentColor: false,
  presences: null,
})

const ONLINE_WINDOW_MS = 15 * 60 * 1000
const SPACER_PATTERN = /^\[spacer\d+\]/i

function sanitizeChannelSegment(segment: string | null | undefined): string | null {
  if (!segment)
    return null

  const cleaned = segment.replace(SPACER_PATTERN, '').trim()
  return cleaned.length ? cleaned : null
}

function buildChannelPath(row: PresenceRow): string {
  const cleanedPath = row.channel_path
    ?.map(sanitizeChannelSegment)
    .filter((segment): segment is string => Boolean(segment))

  if (cleanedPath?.length)
    return cleanedPath.join(' / ')

  const cleanedName = sanitizeChannelSegment(row.channel_name)
  return cleanedName || 'Unknown channel'
}

const normalizedIdentities = computed<TeamSpeakIdentityRecord[]>(() => normalizeTeamSpeakIdentities(props.teamspeakIdentities))
const hasIdentities = computed(() => normalizedIdentities.value.length > 0)

const supabase = useSupabaseClient()

// Only run the internal fetch when no presences are passed in from a parent
const { data: fetchedPresenceRows } = await useAsyncData(
  () => `teamspeak-presence-${props.profileId}`,
  async () => {
    // Skip fetch if parent already supplied presence data
    if (props.presences !== null || !props.richPresenceEnabled)
      return []

    const { data, error } = await supabase
      .from('presences_teamspeak')
      .select('*')
      .eq('profile_id', props.profileId)
      .order('updated_at', { ascending: false })

    if (error)
      return []

    return data ?? []
  },
  {
    default: () => [],
  },
)

const now = computed(() => Date.now())

// Prefer parent-supplied presences; fall back to internally fetched rows
const presenceRows = computed<PresenceRow[]>(() =>
  props.presences !== null ? (props.presences ?? []) : (fetchedPresenceRows.value ?? []),
)

const presenceEntries = computed(() => {
  const rows = presenceRows.value
  return rows.map((row) => {
    const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : null
    const online = lastSeenMs ? now.value - lastSeenMs <= ONLINE_WINDOW_MS : false
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
  })
})

const hasPresence = computed(() => presenceEntries.value.length > 0)
const showWidget = computed(() => hasIdentities.value || (hasPresence.value && props.richPresenceEnabled))
const isOnline = computed(() => presenceEntries.value.some(entry => entry.online))

const anchorRef = ref<HTMLElement | null>(null)
const visible = ref(false)

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt)
    return 'Unknown'
  const date = new Date(lastSeenAt)
  if (Number.isNaN(date.getTime()))
    return 'Unknown'
  return date.toLocaleString()
}
</script>

<template>
  <div
    v-if="showWidget"
    ref="anchorRef"
    class="ts-presence"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
    @focusin="visible = true"
    @focusout="visible = false"
  >
    <slot name="trigger">
      <Flex class="ts-presence__trigger" y-center gap="xs">
        <Icon class="activity-item__icon" name="mdi:teamspeak" :width="props.iconSize" :height="props.iconSize" />
        <span v-if="isOnline && !props.hideOnlineIndicator" class="ts-presence__badge" />
      </Flex>
    </slot>

    <Popout
      :anchor="anchorRef"
      :visible="visible"
      placement="bottom"
      :offset="8"
      :enter-delay="120"
      :leave-delay="150"
      @mouseenter="visible = true"
      @mouseleave="visible = false"
    >
      <div class="ts-presence__tooltip">
        <strong class="text-l text-bold mb-s">
          TeamSpeak
        </strong>
        <div class="ts-presence__section">
          <div v-if="hasIdentities" class="ts-presence__list">
            <div v-for="identity in normalizedIdentities" :key="identity.uniqueId" class="ts-presence__row">
              <span class="ts-presence__identity-label">Identity</span>
              <span class="ts-presence__value">{{ identity.uniqueId }}</span>
            </div>
          </div>
          <div v-else class="ts-presence__empty">
            No TeamSpeak identities linked.
          </div>
        </div>
        <Divider v-if="hasPresence && props.richPresenceEnabled" class="m-xxs p-xxs" :margin="0" />
        <div v-if="props.richPresenceEnabled" class="ts-presence__section">
          <div v-if="hasPresence" class="ts-presence__list">
            <div
              v-for="entry in presenceEntries"
              :key="entry.id"
              class="ts-presence__row"
            >
              <Flex x-between expand y-center gap="s" wrap>
                <Flex gap="xs" expand x-between y-center wrap>
                  <RegionIndicator :region="entry.region" show-label />
                  <Badge :variant="entry.online ? 'success' : 'neutral'" size="s">
                    {{ entry.online ? 'Online' : 'Offline' }}
                  </Badge>
                </Flex>
                <span v-if="entry.online" class="ts-presence__channel">{{ entry.channelPath }}</span>
              </Flex>
              <span class="ts-presence__meta">Last seen {{ formatLastSeen(entry.lastSeenAt) }}</span>

              <Flex v-if="entry.online" x-start class="mt-xs">
                <Button size="s" :href="`/servers/voiceservers#${entry.channelId}`">
                  Show TS viewer
                </Button>
              </Flex>
            </div>
          </div>
        </div>
      </div>
    </Popout>
  </div>
</template>

<style scoped>
.ts-presence {
  display: inline-flex;
}

.ts-presence__trigger {
  cursor: pointer;
  color: var(--color-text);
  position: relative;
}

.ts-presence__trigger--accent {
  color: var(--color-accent);
}

.ts-presence__badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 8px;
  display: block;
  border-radius: 999px;
  background: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-bg);
}

.ts-presence__tooltip {
  width: 328px;
  display: flex;
  flex-direction: column;
  padding: var(--space-m);
  user-select: text;
}

.ts-presence__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-presence__row {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: var(--color-bg-raised);
}

.ts-presence__value {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono, monospace);
}

.ts-presence__identity-label {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--color-text-light);
}

.ts-presence__channel {
  font-weight: 600;
}

.ts-presence__meta {
  font-size: 11px;
  color: var(--color-text-lighter);
}

.ts-presence__empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
}
</style>
