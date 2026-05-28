<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Card, Flex } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'
import { useSupabaseClient, useSupabaseUser } from '#imports'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'

type CalloutState = 'link' | 'enable-presence' | null

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const userId = useUserId()
const isMobile = useBreakpoint('<s')

const profile = ref<Tables<'profiles'> | null>(null)

const state = computed<CalloutState>(() => {
  if (!user.value || !profile.value)
    return null
  if (!profile.value.steam_id)
    return 'link'
  if (!profile.value.rich_presence_enabled)
    return 'enable-presence'
  return null
})

const title = computed(() => {
  if (state.value === 'link')
    return 'Show what you\'re playing'
  if (state.value === 'enable-presence')
    return 'Turn on rich presence'
  return ''
})

const body = computed(() => {
  if (state.value === 'link')
    return 'Link your Steam account to show your game activity alongside the rest of the community.'
  if (state.value === 'enable-presence')
    return 'Steam is linked but rich presence is off. Enable it to show your current game on Hivecom.'
  return ''
})

const buttonLabel = computed(() => {
  if (state.value === 'link')
    return 'Link Steam'
  if (state.value === 'enable-presence')
    return 'Enable Rich Presence'
  return ''
})

onMounted(async () => {
  if (!user.value || !userId.value)
    return

  const { data } = await supabase
    .from('profiles')
    .select('steam_id, rich_presence_enabled')
    .eq('id', userId.value)
    .single()

  if (data)
    profile.value = data as Tables<'profiles'>
})
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
