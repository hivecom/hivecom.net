<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import SignInForm from '@/components/Auth/SignInForm.vue'
import MetaballContainer from '@/components/Shared/MetaballContainer.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const isBelowS = useBreakpoint('<s')
const metaballHeight = computed(() => (isBelowS.value ? '100vh' : 'min(820px, 96vh)'))
const metaballWidth = computed(() => (isBelowS.value ? '100%' : 'min(520px, 96vw)'))
</script>

<template>
  <Flex y-center x-center class="sign-in-page" column expand>
    <MetaballContainer :width="metaballWidth" :height="metaballHeight" min-height="520px" :absolute="isBelowS">
      <SignInForm />
    </MetaballContainer>
    <div class="animated-blob first" />
    <div class="animated-blob second" />
  </Flex>
</template>
