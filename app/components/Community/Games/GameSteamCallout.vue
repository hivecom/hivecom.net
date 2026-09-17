<script setup lang="ts">
import { Button, Card, Flex } from '@dolanske/vui'
import { useSteamPresenceSetup } from '@/composables/useSteamPresenceSetup'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<s')
const { state, title, body, buttonLabel } = useSteamPresenceSetup()
</script>

<template>
  <section v-if="state">
    <Card class="cta-card">
      <Flex :column="isMobile" gap="l" y-center x-between expand>
        <Flex column gap="xs">
          <h2 class="text-bold text-xl">
            {{ title }}
          </h2>
          <p class="text-color-lighter">
            {{ body }}
          </p>
        </Flex>
        <NuxtLink to="/profile/settings#connections" :class="isMobile ? 'w-100' : ''">
          <Button :expand="isMobile" variant="accent">
            {{ buttonLabel }}
          </Button>
        </NuxtLink>
      </Flex>
    </Card>
  </section>
</template>

<style lang="scss" scoped>
.cta-card {
  padding: var(--space-xl);
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
}
</style>
