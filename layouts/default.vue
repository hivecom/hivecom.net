<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'

const supabase = useSupabaseClient()

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}
</script>

<template>
  <div class="container">
    <header :style="{ paddingBlock: '32px' }">
      <Flex space-between>
        <h3>HIVECOM</h3>
        <div>
          <Button square icon="ph:sign-out" @click="signOut">
            Sign Out
          </Button>
        </div>
      </Flex>
    </header>
    <slot />
  </div>
</template>
