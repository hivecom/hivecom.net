<script setup lang="ts">
import type { WhoisData } from '@/composables/useIrcChat'
import { Badge, Flex, Spinner } from '@dolanske/vui'

defineProps<{
  whois: WhoisData
  /** When true, omits the top border separator (e.g. when no profile card precedes it). */
  standalone?: boolean
  ircOnly?: boolean
  isService?: boolean
  isBot?: boolean
}>()
</script>

<template>
  <Flex column gap="s" class="irc-whois-card" :class="{ 'irc-whois-card--standalone': standalone }">
    <Flex y-center gap="xs">
      <span class="irc-whois-card__label">IRC</span>
      <Badge v-if="ircOnly" variant="neutral" size="s">
        IRC Only
      </Badge>
      <Badge v-if="isService" variant="info" size="s">
        Service
      </Badge>
      <Badge v-else-if="isBot" variant="neutral" size="s">
        Bot
      </Badge>
      <Badge v-if="whois.secure" variant="success" size="s">
        TLS
      </Badge>
      <Badge v-if="whois.isOper" variant="warning" size="s">
        IRC Op
      </Badge>
    </Flex>
    <Flex v-if="whois.loading && !whois.user" y-center gap="xs" class="text-s text-color-lighter">
      <Spinner size="s" />
      <span>Fetching WHOIS...</span>
    </Flex>
    <p v-else-if="whois.notFound" class="irc-whois-card__not-found text-s text-color-lighter">
      No such user.
    </p>
    <template v-else>
      <dl class="irc-whois-card__grid">
        <template v-if="whois.away">
          <dt>Status</dt>
          <dd>Away - {{ whois.away }}</dd>
        </template>
        <template v-if="whois.realname">
          <dt>Real name</dt>
          <dd>{{ whois.realname }}</dd>
        </template>
        <template v-if="whois.user && whois.host">
          <dt>Host</dt>
          <dd>{{ whois.user }}@{{ whois.host }}</dd>
        </template>
        <template v-if="whois.idleFmt">
          <dt>Idle</dt>
          <dd>
            {{ whois.idleFmt }}<template v-if="whois.signonTs">
              (since {{ whois.signonTs }})
            </template>
          </dd>
        </template>
        <template v-if="whois.server">
          <dt>Server</dt>
          <dd>
            {{ whois.server }}<template v-if="whois.serverInfo">
              ({{ whois.serverInfo }})
            </template>
          </dd>
        </template>
        <template v-if="whois.channels">
          <dt>Channels</dt>
          <dd>{{ whois.channels }}</dd>
        </template>
      </dl>
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.irc-whois-card {
  padding-top: var(--space-m);
  margin-top: var(--space-s);
  margin-bottom: var(--space-s);
  border-top: 1px solid var(--color-border);

  &--standalone {
    border-top: none;
    margin-top: 0;
    padding-top: 0;
  }

  &__not-found {
    margin: 0;
  }

  &__label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__grid {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--space-m);
    row-gap: var(--space-xs);
    margin: 0;

    dt {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
      white-space: nowrap;
    }

    dd {
      margin: 0;
      font-size: var(--font-size-s);
      color: var(--color-text);
      word-break: break-word;
    }
  }
}
</style>
