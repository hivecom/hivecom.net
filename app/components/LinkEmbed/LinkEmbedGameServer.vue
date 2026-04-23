<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import { Flex } from '@dolanske/vui'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import { useDataGameAssets } from '@/composables/useDataGameAssets'
// useGameConnect is consumed inside GameServerConnectButton

type GameserverData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']> & { type: 'gameserver' }

const props = defineProps<{
  data: GameserverData
}>()

const gameBackground = ref<string | null>(null)

watch(
  () => props.data,
  async (d) => {
    if (d.gameShorthand == null || d.gameShorthand === '') {
      gameBackground.value = null
      return
    }
    try {
      const { getGameBackgroundUrl } = useDataGameAssets()
      gameBackground.value = await getGameBackgroundUrl({ shorthand: d.gameShorthand } as Parameters<typeof getGameBackgroundUrl>[0])
    }
    catch {
      gameBackground.value = null
    }
  },
  { immediate: true },
)

const containerStateConfig = computed(() => {
  const configs = {
    healthy: { color: 'success' as const, label: 'Healthy' },
    running: { color: 'info' as const, label: 'Running' },
    unhealthy: { color: 'warning' as const, label: 'Unhealthy' },
    offline: { color: 'danger' as const, label: 'Offline' },
    unknown: { color: 'neutral' as const, label: 'Unknown' },
  }
  return configs[props.data.containerState] ?? configs.unknown
})

const hasAddresses = computed(() => props.data.addresses && props.data.addresses.length > 0)
</script>

<template>
  <NuxtLink
    class="link-embed link-embed--gameserver"
    :href="data.href"
  >
    <!-- Game background image -->
    <div
      v-if="gameBackground"
      class="link-embed__game-bg"
      :style="{ backgroundImage: `url(${gameBackground})` }"
    />

    <Flex column gap="xs" class="link-embed__body link-embed__body--column link-embed__body--gameserver">
      <Flex y-center gap="s" class="link-embed__header">
        <Icon name="ph:game-controller" class="link-embed__icon" />
        <span class="link-embed__eyebrow">Game server</span>
        <template v-if="containerStateConfig">
          <span class="link-embed__eyebrow link-embed__eyebrow--sep">&middot;</span>
          <Flex y-center gap="xs">
            <span
              class="link-embed__status-dot"
              :class="`link-embed__status-dot--${data.containerState}`"
            />
            <span class="link-embed__eyebrow">{{ containerStateConfig.label }}</span>
          </Flex>
        </template>
      </Flex>

      <span class="link-embed__title">{{ data.name }}</span>

      <p v-if="data.description" class="link-embed__description">
        {{ data.description }}
      </p>

      <Flex y-center x-between expand gap="s" class="link-embed__meta">
        <Flex y-center gap="s">
          <span v-if="data.gameName" class="link-embed__meta-item">{{ data.gameName }}</span>
          <template v-if="data.gameName && data.region">
            <span class="link-embed__meta-sep">&middot;</span>
          </template>
          <span v-if="data.region" class="link-embed__meta-item">{{ data.region.toUpperCase() }}</span>
        </Flex>

        <!-- Connect button - stop propagation so the NuxtLink doesn't navigate -->
        <GameServerConnectButton
          v-if="hasAddresses"
          :addresses="data.addresses"
          :port="data.port"
          :game-shorthand="data.gameShorthand"
          variant="gray"
          size="s"
          stop-propagation
        />
      </Flex>
    </Flex>
  </NuxtLink>
</template>

<style scoped lang="scss">
.link-embed__game-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center right;
  background-repeat: no-repeat;
  z-index: 0;
}

.link-embed__body--gameserver {
  position: relative;
  z-index: 1;
  padding: var(--space-s) var(--space-m);
  /* Solid background that fades out diagonally, masking the game image on the left */
  background-image: linear-gradient(
    120deg,
    var(--color-bg-lowered) 0%,
    var(--color-bg-lowered) 32%,
    color-mix(in srgb, var(--color-bg-lowered) 60%, transparent) 58%,
    color-mix(in srgb, var(--color-bg-lowered) 20%, transparent) 72%,
    transparent 85%
  );
}

.link-embed__status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 1px;

  &--healthy {
    background-color: var(--color-text-green);
  }
  &--running {
    background-color: var(--color-text-blue);
  }
  &--unhealthy {
    background-color: var(--color-text-yellow);
  }
  &--offline {
    background-color: var(--color-text-red);
  }
  &--unknown {
    background-color: var(--color-text-lighter);
  }
}
</style>
