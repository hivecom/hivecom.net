<script setup lang="ts">
import type { ChannelRole } from '@/composables/useIrcChat'
import { Badge, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'

const props = defineProps<{
  role: ChannelRole | null
  /** Show the icon directly without a Badge wrapper. */
  icon?: boolean
}>()

const { settings } = useDataUserSettings()

const ROLE_ICONS: Record<string, string> = {
  'Owner': 'ph:crown',
  'Admin': 'ph:shield-star',
  'Operator': 'ph:shield-check',
  'Half-operator': 'ph:shield',
  'Voiced': 'ph:microphone',
}

const icon = computed(() => props.role ? (ROLE_ICONS[props.role.label] ?? 'ph:circle') : null)
</script>

<template>
  <template v-if="role">
    <Tooltip v-if="settings.chat_irc_native_modes" placement="top">
      <span
        class="user-role-badge__symbol"
        :style="{ color: role.color }"
      >{{ role.symbol }}</span>
      <template #tooltip>
        <p>{{ role.label }}</p>
      </template>
    </Tooltip>
    <Tooltip v-else placement="top">
      <Icon v-if="props.icon" :name="icon!" size="12" :style="{ color: role.color }" />
      <Badge v-else size="s" outline>
        <Icon :name="icon!" size="12" :style="{ color: role.color }" />
      </Badge>
      <template #tooltip>
        <p>{{ role.label }}</p>
      </template>
    </Tooltip>
  </template>
</template>

<style lang="scss" scoped>
.user-role-badge {
  &__symbol {
    font-size: var(--font-size-xxs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }
}
</style>
