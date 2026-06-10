<script setup lang="ts">
import { Badge, Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{
  modes?: Set<string> | undefined
  isBot?: boolean
  isService?: boolean
  /** When true, always shows icon badges - never the full native mode string. */
  compact?: boolean
  /** When true and chat_irc_native_modes is on, shows only the relevant mode chars (filtered to known modes) as a short string instead of icon badges. */
  shortform?: boolean
}>()

interface ModeBadge {
  mode: string
  icon: string
  label: string
}

const MODE_BADGES: ModeBadge[] = [
  { mode: 'k', icon: 'ph:lock-simple', label: 'Password protected' },
  { mode: 'i', icon: 'ph:envelope-simple', label: 'Invite only' },
  { mode: 'm', icon: 'ph:microphone-slash', label: 'Moderated' },
  { mode: 's', icon: 'ph:eye-slash', label: 'Hidden from channel list' },
  { mode: 'r', icon: 'ph:seal-check', label: 'Registered users only' },
  { mode: 'u', icon: 'ph:megaphone', label: 'Auditorium - member list hidden from non-operators' },
  { mode: 'U', icon: 'ph:ghost', label: 'Operator-moderated - messages from non-voiced users are forwarded to operators only' },
]

const { settings } = useDataUserSettings()
const { account } = useIrcChat()

const isUnregistered = computed(() => account.value === '')
const registrationRequired = computed(() =>
  !!props.modes && (props.modes.has('r') || props.modes.has('R')),
)

const RELEVANT_MODE_CHARS = new Set(MODE_BADGES.map(b => b.mode))

const shortformModes = computed(() => {
  const modes = props.modes
  if (!modes || modes.size === 0)
    return ''
  const chars = [...modes].filter(m => RELEVANT_MODE_CHARS.has(m)).sort()
  return chars.length ? `+${chars.join('')}` : ''
})

const activeBadges = computed(() => {
  const modes = props.modes
  if (!modes || modes.size === 0)
    return []
  return MODE_BADGES.filter(b => modes.has(b.mode))
})

const hasContent = computed(() => {
  return !!(props.isService
    || props.isBot
    || (registrationRequired.value && isUnregistered.value)
    || activeBadges.value.length > 0
    || (props.shortform && settings.value.chat_irc_native_modes && shortformModes.value)
    || (!props.compact && !props.shortform && settings.value.chat_irc_native_modes && props.modes?.size))
})
</script>

<template>
  <Flex v-if="hasContent" y-center gap="xxs">
    <Tooltip v-if="isService" placement="top">
      <Badge size="s" outline>
        <Icon name="ph:shield-check" size="12" class="text-color-lighter" />
      </Badge>
      <template #tooltip>
        <p>IRC Service</p>
      </template>
    </Tooltip>
    <Tooltip v-else-if="isBot" placement="top">
      <Badge size="s" outline>
        <Icon name="ph:robot" size="12" class="text-color-lighter" />
      </Badge>
      <template #tooltip>
        <p>Bot</p>
      </template>
    </Tooltip>
    <Tooltip v-if="registrationRequired && isUnregistered" placement="top">
      <Badge size="s" outline class="channel-mode-badges__reg-warning">
        <Icon name="ph:warning" size="12" />
      </Badge>
      <template #tooltip>
        <p>Registration required - you may not be able to speak</p>
      </template>
    </Tooltip>
    <template v-if="props.shortform && settings.chat_irc_native_modes && shortformModes">
      <Tooltip placement="top">
        <span class="channel-mode-badges__mode-string">{{ shortformModes }}</span>
        <template #tooltip>
          <Flex column gap="xxs">
            <p v-for="badge in activeBadges" :key="badge.mode" class="channel-mode-badges__tooltip-line">
              {{ badge.label }}
            </p>
          </Flex>
        </template>
      </Tooltip>
    </template>
    <template v-else-if="!props.compact && !props.shortform && settings.chat_irc_native_modes && props.modes && props.modes.size">
      <span class="channel-mode-badges__mode-string">+{{ [...props.modes].sort().join('') }}</span>
    </template>
    <template v-else>
      <Tooltip
        v-for="badge in activeBadges"
        :key="badge.mode"
        placement="top"
      >
        <Badge size="s" outline>
          <Icon :name="badge.icon" size="12" class="text-color-lighter" />
        </Badge>
        <template #tooltip>
          <p>{{ badge.label }}</p>
        </template>
      </Tooltip>
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.channel-mode-badges {
  &__reg-warning {
    color: var(--color-text-yellow);
    border-color: var(--color-text-yellow);
  }

  &__tooltip-line {
    margin: 0;
    font-size: var(--font-size-xs);
  }

  &__mode-string {
    font-size: var(--font-size-xxs);
    font-weight: var(--font-weight-semibold);
    font-family: monospace;
    color: var(--color-text-lighter);
    line-height: 1;
  }
}
</style>
