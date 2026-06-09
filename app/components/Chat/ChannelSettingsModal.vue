<script setup lang="ts">
import { Badge, Button, Divider, Flex, Input, Modal, pushToast, Spinner, Switch, Tab, Tabs } from '@dolanske/vui'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import ColorPicker from '@/components/Shared/ColorPicker.vue'
import { channelRole, useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{ channel: string | null }>()

const emit = defineEmits<{ close: [] }>()

const RichTextEditor = defineAsyncComponent(() => import('@/components/Editor/RichTextEditor.vue'))

const { buffers, send, setChannelMetadata, deleteChannelMetadata, myChannelRole, fetchListModes, queryChanServInfo, suppressChanServResponse, nick } = useIrcChat()

const buf = computed(() => {
  if (!props.channel)
    return null
  return buffers.value.find(b => b.name.toLowerCase() === props.channel!.toLowerCase()) ?? null
})

const role = computed(() => props.channel ? myChannelRole(props.channel) : null)

const OP_PREFIXES = new Set(['~', '&', '@'])
const HALFOP_PREFIXES = new Set(['~', '&', '@', '%'])

const canEdit = computed(() => OP_PREFIXES.has(role.value?.symbol ?? ''))
const canHalfOp = computed(() => HALFOP_PREFIXES.has(role.value?.symbol ?? ''))
const canEditTopic = computed(() => {
  if (!canHalfOp.value)
    return false
  // If +t is set, only ops can change the topic
  if (buf.value?.modes?.has('t') && !canEdit.value)
    return false
  return true
})

type FlagKey = 'i' | 'm' | 's' | 't' | 'n' | 'R' | 'M' | 'C' | 'u' | 'U'

const modeFlags: Array<{ mode: FlagKey, label: string, description: string }> = [
  { mode: 'i', label: 'Invite-only', description: 'Users must be invited to join' },
  { mode: 'm', label: 'Moderated', description: 'Only voiced users and operators can speak' },
  { mode: 's', label: 'Secret', description: 'Hidden from channel lists, WHO, and NAMES for non-members' },
  { mode: 't', label: 'Topic locked', description: 'Only operators can change the topic' },
  { mode: 'n', label: 'No external messages', description: 'Only members can send messages to the channel' },
  { mode: 'R', label: 'Registered-only join', description: 'Only logged-in users may join' },
  { mode: 'M', label: 'Registered-only speak', description: 'Only logged-in users may speak' },
  { mode: 'C', label: 'No CTCP', description: 'Block CTCP messages (except /me actions)' },
  { mode: 'u', label: 'Auditorium', description: 'Hide join/part/quit of unprivileged users' },
  { mode: 'U', label: 'Op-moderated', description: 'Messages from unprivileged users are seen only by operators' },
]

type ActiveTab = 'channel' | 'bans' | 'members' | 'appearance'
const activeTab = ref<ActiveTab>('channel')

// Draft state
const draftTopic = ref('')
const draftDisplayName = ref('')
const draftAvatar = ref('')
const draftColor = ref('')
const draftHomepage = ref('')
const draftMarkdown = ref('')
const draftFlags = ref<Record<FlagKey, boolean>>({ i: false, m: false, s: false, t: false, n: false, R: false, M: false, C: false, u: false, U: false })
const draftPassword = ref('')
const draftPasswordEnabled = ref(false)
const draftLimit = ref('')
const draftForward = ref('')

function populateDraft() {
  if (!buf.value)
    return
  draftTopic.value = buf.value.topic ?? ''
  draftDisplayName.value = buf.value.metadata?.get('display-name') ?? ''
  draftAvatar.value = buf.value.metadata?.get('avatar') ?? ''
  draftColor.value = buf.value.metadata?.get('color') ?? ''
  draftHomepage.value = buf.value.metadata?.get('homepage') ?? ''
  draftMarkdown.value = buf.value.metadata?.get('hivecom.net/markdown') ?? ''
  draftFlags.value = {
    i: buf.value.modes?.has('i') ?? false,
    m: buf.value.modes?.has('m') ?? false,
    s: buf.value.modes?.has('s') ?? false,
    t: buf.value.modes?.has('t') ?? false,
    n: buf.value.modes?.has('n') ?? false,
    R: buf.value.modes?.has('R') ?? false,
    M: buf.value.modes?.has('M') ?? false,
    C: buf.value.modes?.has('C') ?? false,
    u: buf.value.modes?.has('u') ?? false,
    U: buf.value.modes?.has('U') ?? false,
  }
  draftPassword.value = ''
  draftPasswordEnabled.value = buf.value.modes?.has('k') ?? false
  draftLimit.value = ''
  draftForward.value = buf.value.modeParams?.get('f') ?? ''
}

watch(() => props.channel, (val) => {
  if (val) {
    activeTab.value = 'channel'
    populateDraft()
    queryChanServInfo(val)
    send(`MODE ${val}`)
  }
})

// Re-populate draft when modes arrive (server 324 response)
watch(() => buf.value?.modes, () => {
  if (props.channel)
    populateDraft()
})

// Close if the buffer goes away (e.g. left channel)
watch(buf, (val) => {
  if (!val && props.channel)
    emit('close')
})

// Fetch ban lists when switching to the bans tab
watch(activeTab, (val) => {
  if (val === 'bans' && props.channel)
    fetchListModes(props.channel)
})

const allBansReady = computed(() =>
  (buf.value?.banListReady ?? false)
  && (buf.value?.exceptListReady ?? false)
  && (buf.value?.inviteListReady ?? false),
)

// Members helpers
const PREFIX_ORDER = '~&@%+'
function prefixRankOf(symbol: string) {
  const i = PREFIX_ORDER.indexOf(symbol)
  return i < 0 ? PREFIX_ORDER.length : i
}

const myRankValue = computed(() => prefixRankOf(role.value?.symbol ?? ''))

function canActionUser(targetPrefix: string): boolean {
  if (!canEdit.value)
    return false
  const targetSymbol = channelRole(targetPrefix)?.symbol ?? ''
  return prefixRankOf(targetSymbol) > myRankValue.value
}

function hasVoice(prefix: string) {
  return prefix.includes('+')
}

function hasOp(prefix: string) {
  return prefix.includes('@')
}

function kickUser(targetNick: string) {
  if (!props.channel)
    return
  send(`KICK ${props.channel} ${targetNick}`)
}

function banKickUser(targetNick: string) {
  if (!props.channel)
    return
  send(`MODE ${props.channel} +b ${targetNick}!*@*`)
  send(`KICK ${props.channel} ${targetNick}`)
}

function toggleVoice(targetNick: string, currentPrefix: string) {
  if (!props.channel)
    return
  const flag = hasVoice(currentPrefix) ? '-v' : '+v'
  send(`MODE ${props.channel} ${flag} ${targetNick}`)
}

function toggleOp(targetNick: string, currentPrefix: string) {
  if (!props.channel)
    return
  const flag = hasOp(currentPrefix) ? '-o' : '+o'
  send(`MODE ${props.channel} ${flag} ${targetNick}`)
}

function registerChannel() {
  if (!props.channel || !buf.value)
    return
  buf.value.registered = true
  suppressChanServResponse(props.channel)
  send(`PRIVMSG ChanServ :REGISTER ${props.channel}`)
}

function dropChannel() {
  if (!props.channel || !buf.value)
    return
  buf.value.registered = false
  suppressChanServResponse(props.channel)
  send(`PRIVMSG ChanServ :DROP ${props.channel}`)
}

function unban(mask: string) {
  if (!props.channel)
    return
  send(`MODE ${props.channel} -b ${mask}`)
}

function removeException(mask: string) {
  if (!props.channel)
    return
  send(`MODE ${props.channel} -e ${mask}`)
}

function removeInvite(mask: string) {
  if (!props.channel)
    return
  send(`MODE ${props.channel} -I ${mask}`)
}

function formatBanTs(ts: number): string {
  if (!ts)
    return ''
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function save() {
  if (!props.channel || !buf.value)
    return
  const ch = props.channel

  // Topic
  if (canEditTopic.value && draftTopic.value !== (buf.value.topic ?? '')) {
    send(`TOPIC ${ch} :${draftTopic.value}`)
  }

  if (canEdit.value) {
    // Mode flags diff
    const flagModes = Object.keys(draftFlags.value) as FlagKey[]
    const toAdd = flagModes.filter(f => draftFlags.value[f] && !buf.value!.modes?.has(f))
    const toRemove = flagModes.filter(f => !draftFlags.value[f] && buf.value!.modes?.has(f))

    let modeStr = ''
    const modeParams: string[] = []

    if (toAdd.length)
      modeStr += `+${toAdd.join('')}`
    if (toRemove.length)
      modeStr += `-${toRemove.join('')}`

    // Password
    if (draftPasswordEnabled.value && draftPassword.value.trim()) {
      modeStr += '+k'
      modeParams.push(draftPassword.value.trim())
    }
    else if (!draftPasswordEnabled.value && buf.value.modes?.has('k')) {
      modeStr += '-k'
      modeParams.push('*')
    }

    // User limit
    const limitNum = Number.parseInt(draftLimit.value)
    if (!Number.isNaN(limitNum) && limitNum > 0) {
      modeStr += '+l'
      modeParams.push(String(limitNum))
    }
    else if ((draftLimit.value === '0' || draftLimit.value === '') && buf.value.modes?.has('l')) {
      modeStr += '-l'
    }

    // Channel forward (+f)
    const currentForward = buf.value.modeParams?.get('f') ?? ''
    const forwardTrimmed = draftForward.value.trim()
    if (forwardTrimmed && forwardTrimmed !== currentForward) {
      modeStr += '+f'
      modeParams.push(forwardTrimmed)
    }
    else if (!forwardTrimmed && currentForward) {
      modeStr += '-f'
    }

    if (modeStr)
      send(`MODE ${ch} ${modeStr}${modeParams.length ? ` ${modeParams.join(' ')}` : ''}`)

    // Metadata
    const metaFields: Array<[string, string]> = [
      ['display-name', draftDisplayName.value.trim()],
      ['avatar', draftAvatar.value.trim()],
      ['color', draftColor.value.trim()],
      ['homepage', draftHomepage.value.trim()],
      ['hivecom.net/markdown', draftMarkdown.value],
    ]

    for (const [key, value] of metaFields) {
      const current = buf.value.metadata?.get(key) ?? ''
      if (value !== current) {
        if (value)
          setChannelMetadata(ch, key, value)
        else
          deleteChannelMetadata(ch, key)
      }
    }
  }

  pushToast('Channel settings applied')
  emit('close')
}
</script>

<template>
  <Modal :open="channel !== null" size="m" @close="emit('close')">
    <template #header>
      <Flex y-center gap="s">
        <h4>
          {{ channel }}
        </h4>
        <span v-if="buf?.modes?.size" class="channel-settings__mode-string">+{{ [...buf.modes].sort().join('') }}</span>
      </Flex>
    </template>

    <Flex column gap="m" expand class="channel-settings">
      <Tabs v-model="activeTab">
        <Tab value="channel">
          Channel
        </Tab>
        <Tab value="bans">
          Bans
        </Tab>
        <Tab value="members">
          Members
        </Tab>
        <Tab value="appearance">
          Appearance
        </Tab>
      </Tabs>

      <!-- Channel tab -->
      <template v-if="activeTab === 'channel'">
        <!-- Registration -->
        <Flex y-center x-between expand class="channel-settings__flag-row">
          <Flex column :gap="0">
            <span class="channel-settings__label">Channel persistence registration</span>
          </Flex>
          <Flex y-center gap="xs">
            <Spinner v-if="buf?.registered === undefined" size="s" />
            <Badge v-else-if="buf.registered" variant="success" outline size="s">
              Registered
            </Badge>
            <Badge v-else variant="neutral" outline size="s">
              Not registered
            </Badge>
            <Button v-if="canEdit && buf?.registered === false" size="s" variant="accent" @click="registerChannel">
              Register
            </Button>
            <Button v-if="canEdit && buf?.registered === true" size="s" variant="danger" plain @click="dropChannel">
              Drop
            </Button>
          </Flex>
        </Flex>

        <Divider />

        <!-- Topic -->
        <Flex column gap="xs" expand>
          <label class="channel-settings__label">Topic</label>
          <Input
            v-model="draftTopic"
            expand
            placeholder="Set channel topic..."
            :disabled="!canEditTopic"
          />
          <p v-if="!canEditTopic" class="text-xxs text-color-lighter channel-settings__hint">
            {{ buf?.modes?.has('t') ? 'Topic is locked - operator required' : 'Insufficient privileges to change topic' }}
          </p>
        </Flex>

        <Divider />

        <!-- Mode flags -->
        <Flex column gap="s" expand>
          <span class="channel-settings__label">Channel Modes</span>
          <Flex column gap="s" expand>
            <Flex
              v-for="flag in modeFlags"
              :key="flag.mode"
              y-center
              x-between
              expand
              class="channel-settings__flag-row"
            >
              <Flex column :gap="0">
                <span class="text-s">{{ flag.label }}</span>
                <span class="text-xxs text-color-lighter">{{ flag.description }}</span>
              </Flex>
              <Switch v-model="draftFlags[flag.mode]" :disabled="!canEdit" />
            </Flex>

            <!-- Password toggle (op+ only) -->
            <template v-if="canEdit">
              <Flex y-center x-between expand class="channel-settings__flag-row">
                <Flex column :gap="0">
                  <span class="text-s">Password protected</span>
                  <span class="text-xxs text-color-lighter">Require a key to join</span>
                </Flex>
                <Switch v-model="draftPasswordEnabled" />
              </Flex>
              <Input
                v-if="draftPasswordEnabled"
                v-model="draftPassword"
                type="password"
                expand
                :placeholder="buf?.modes?.has('k') ? 'Set new password (leave empty to keep current)...' : 'Enter password...'"
              />
            </template>
          </Flex>
        </Flex>

        <template v-if="canEdit">
          <Divider />

          <!-- User limit -->
          <Flex column gap="xs" expand>
            <Flex y-center x-between expand>
              <span class="channel-settings__label">User limit</span>
              <Badge v-if="buf?.modes?.has('l')" size="s" variant="neutral" outline>
                Limited
              </Badge>
            </Flex>
            <Input
              v-model="draftLimit"
              type="number"
              :min="0"
              expand
              placeholder="0 = no limit"
            />
            <p class="text-xxs text-color-lighter channel-settings__hint">
              Set 0 or leave empty to remove an existing limit.
            </p>
          </Flex>

          <Divider />

          <!-- Channel forward (+f) -->
          <Flex column gap="xs" expand>
            <Flex y-center x-between expand>
              <span class="channel-settings__label">Forward channel</span>
              <Badge v-if="buf?.modes?.has('f')" size="s" variant="neutral" outline>
                Active
              </Badge>
            </Flex>
            <Input
              v-model="draftForward"
              expand
              placeholder="#channel - redirect users who cannot join"
            />
            <p class="text-xxs text-color-lighter channel-settings__hint">
              Users banned or blocked from joining are forwarded here. Leave empty to disable.
            </p>
          </Flex>
        </template>
      </template>

      <!-- Bans tab -->
      <template v-if="activeTab === 'bans'">
        <p v-if="!canEdit" class="text-xs text-color-lighter channel-settings__hint">
          Managing bans requires operator privileges.
        </p>

        <template v-if="!allBansReady">
          <Flex y-center x-center expand class="channel-settings__loading">
            <Spinner />
          </Flex>
        </template>

        <template v-else>
          <!-- Ban list -->
          <Flex column gap="xs" expand>
            <span class="channel-settings__label">Bans</span>
            <p v-if="!buf?.banList?.length" class="text-xs text-color-lighter channel-settings__hint">
              No bans set.
            </p>
            <Flex
              v-for="entry in buf?.banList"
              :key="entry.mask"
              y-center
              x-between
              gap="s"
              expand
              class="channel-settings__list-row"
            >
              <Flex column :gap="0" class="channel-settings__list-row-info">
                <span class="text-s channel-settings__mask">{{ entry.mask }}</span>
                <span class="text-xxs text-color-lighter">
                  {{ entry.setBy ? `set by ${entry.setBy}` : '' }}{{ entry.setBy && entry.ts ? ' - ' : '' }}{{ entry.ts ? formatBanTs(entry.ts) : '' }}
                </span>
              </Flex>
              <Button v-if="canEdit" size="s" variant="danger" plain @click="unban(entry.mask)">
                Unban
              </Button>
            </Flex>
          </Flex>

          <Divider />

          <!-- Exception list -->
          <Flex column gap="xs" expand>
            <span class="channel-settings__label">Ban exceptions</span>
            <p v-if="!buf?.exceptList?.length" class="text-xs text-color-lighter channel-settings__hint">
              No exceptions set.
            </p>
            <Flex
              v-for="entry in buf?.exceptList"
              :key="entry.mask"
              y-center
              x-between
              gap="s"
              expand
              class="channel-settings__list-row"
            >
              <Flex column :gap="0" class="channel-settings__list-row-info">
                <span class="text-s channel-settings__mask">{{ entry.mask }}</span>
                <span class="text-xxs text-color-lighter">
                  {{ entry.setBy ? `set by ${entry.setBy}` : '' }}{{ entry.setBy && entry.ts ? ' - ' : '' }}{{ entry.ts ? formatBanTs(entry.ts) : '' }}
                </span>
              </Flex>
              <Button v-if="canEdit" size="s" variant="danger" plain @click="removeException(entry.mask)">
                Remove
              </Button>
            </Flex>
          </Flex>

          <Divider />

          <!-- Invite exception list -->
          <Flex column gap="xs" expand>
            <span class="channel-settings__label">Invite exceptions</span>
            <p v-if="!buf?.inviteList?.length" class="text-xs text-color-lighter channel-settings__hint">
              No invite exceptions set.
            </p>
            <Flex
              v-for="entry in buf?.inviteList"
              :key="entry.mask"
              y-center
              x-between
              gap="s"
              expand
              class="channel-settings__list-row"
            >
              <Flex column :gap="0" class="channel-settings__list-row-info">
                <span class="text-s channel-settings__mask">{{ entry.mask }}</span>
                <span class="text-xxs text-color-lighter">
                  {{ entry.setBy ? `set by ${entry.setBy}` : '' }}{{ entry.setBy && entry.ts ? ' - ' : '' }}{{ entry.ts ? formatBanTs(entry.ts) : '' }}
                </span>
              </Flex>
              <Button v-if="canEdit" size="s" variant="danger" plain @click="removeInvite(entry.mask)">
                Remove
              </Button>
            </Flex>
          </Flex>
        </template>
      </template>

      <!-- Members tab -->
      <template v-if="activeTab === 'members'">
        <Flex column gap="xs" expand>
          <Flex
            v-for="user in buf?.users"
            :key="user.name"
            y-center
            x-between
            gap="s"
            expand
            class="channel-settings__member-row"
          >
            <Flex y-center gap="xs">
              <span
                v-if="channelRole(user.prefix)"
                class="channel-settings__role-symbol"
                :style="{ color: channelRole(user.prefix)?.color }"
              >{{ channelRole(user.prefix)?.symbol }}</span>
              <span class="text-s" :class="{ 'text-color-lighter': user.name.toLowerCase() === nick.toLowerCase() }">
                {{ user.name }}
              </span>
              <Badge v-if="channelRole(user.prefix)" size="s" variant="neutral" outline>
                {{ channelRole(user.prefix)?.label }}
              </Badge>
            </Flex>
            <Flex v-if="canActionUser(user.prefix)" gap="xs">
              <Button size="s" variant="gray" plain @click="toggleVoice(user.name, user.prefix)">
                {{ hasVoice(user.prefix) ? '-v' : '+v' }}
              </Button>
              <Button size="s" variant="gray" plain @click="toggleOp(user.name, user.prefix)">
                {{ hasOp(user.prefix) ? '-o' : '+o' }}
              </Button>
              <Button size="s" variant="gray" plain @click="kickUser(user.name)">
                Kick
              </Button>
              <Button size="s" variant="danger" plain @click="banKickUser(user.name)">
                Ban
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </template>

      <!-- Appearance tab -->
      <template v-if="activeTab === 'appearance'">
        <p v-if="!canEdit" class="text-xs text-color-lighter channel-settings__hint">
          Appearance metadata requires operator privileges.
        </p>

        <Flex column gap="m" expand>
          <Flex column gap="xs" expand>
            <label class="channel-settings__label">Display name</label>
            <Input
              v-model="draftDisplayName"
              expand
              placeholder="Friendly channel name"
              :disabled="!canEdit"
            />
            <p class="text-xxs text-color-lighter channel-settings__hint">
              Shown in the channel list instead of the raw #slug.
            </p>
          </Flex>

          <Flex column gap="xs" expand>
            <label class="channel-settings__label">Avatar URL</label>
            <Input
              v-model="draftAvatar"
              expand
              placeholder="https://..."
              :disabled="!canEdit"
            />
          </Flex>

          <ColorPicker
            v-model="draftColor"
            label="Accent color"
            stacked
            clearable
          />

          <Flex column gap="xs" expand>
            <label class="channel-settings__label">Homepage</label>
            <Input
              v-model="draftHomepage"
              expand
              placeholder="https://..."
              :disabled="!canEdit"
            />
          </Flex>

          <Flex column gap="xs" expand>
            <label class="channel-settings__label">Markdown</label>
            <RichTextEditor
              v-model="draftMarkdown"
              placeholder="Channel description - markdown supported"
              min-height="120px"
              :disabled="!canEdit"
            />
          </Flex>
        </Flex>
      </template>
    </Flex>

    <template #footer>
      <Flex x-end gap="xs">
        <Button variant="gray" @click="emit('close')">
          Cancel
        </Button>
        <Button
          v-if="activeTab !== 'bans' && activeTab !== 'members'"
          variant="accent"
          :disabled="!canEditTopic && !canEdit"
          @click="save"
        >
          Apply
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.channel-settings {
  &__mode-string {
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  &__hint {
    margin: 0;
  }

  &__flag-row {
    min-height: 34px;
  }

  &__loading {
    min-height: 120px;
  }

  &__list-row {
    min-height: 34px;
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--color-border-weak);

    &:last-child {
      border-bottom: none;
    }
  }

  &__list-row-info {
    min-width: 0;
    flex: 1;
  }

  &__mask {
    font-family: monospace;
    word-break: break-all;
  }

  &__member-row {
    min-height: 34px;
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--color-border-weak);

    &:last-child {
      border-bottom: none;
    }
  }

  &__role-symbol {
    font-weight: var(--font-weight-semibold);
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }
}
</style>
