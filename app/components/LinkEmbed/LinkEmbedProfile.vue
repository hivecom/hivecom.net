<script setup lang="ts">
import type { useDataLinkPreview } from '@/composables/useDataLinkPreview'
import { useSupabaseUser } from '#imports'
import { Button, Flex } from '@dolanske/vui'
import { resolveComponent } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

import UserRole from '@/components/Shared/UserRole.vue'
import { getAnonymousUsername } from '@/lib/anonymousUsernames'
import { useBreakpoint } from '@/lib/mediaQuery'

type LinkPreviewData = NonNullable<ReturnType<typeof useDataLinkPreview>['data']['value']>
type ProfileData = LinkPreviewData & { type: 'profile' }

const props = defineProps<{
  data: ProfileData
}>()

const NuxtLink = resolveComponent('NuxtLink')
const isMobile = useBreakpoint('<s')
const user = useSupabaseUser()

// Show real data when the profile is public, or when the user is signed in.
const showRealData = computed(() => props.data.isPublic || !!user.value)
</script>

<template>
  <component
    :is="showRealData ? NuxtLink : 'div'"
    class="link-embed link-embed--profile"
    v-bind="showRealData ? { href: props.data.href } : {}"
  >
    <Flex class="link-embed__body link-embed__body--profile" y-center gap="s">
      <UserAvatar :user-id="props.data.userId" size="m" show-preview class="link-embed__avatar" />
      <Flex column gap="xxs" class="link-embed__profile-info">
        <Flex y-center gap="xs">
          <span class="link-embed__title">
            {{ showRealData ? props.data.username : getAnonymousUsername(props.data.userId) }}
          </span>
        </Flex>
        <p v-if="showRealData && props.data.introduction" class="link-embed__description">
          {{ props.data.introduction }}
        </p>
        <span v-else-if="showRealData" class="link-embed__description link-embed__description--empty">
          No introduction
        </span>
        <span v-else class="link-embed__description link-embed__description--empty">
          Sign in to view this profile
        </span>
      </Flex>
      <UserRole v-if="showRealData" :user-id="props.data.userId" size="xs" :tiny="isMobile" class="link-embed__role" />
      <NuxtLink
        v-if="!showRealData"
        to="/auth/sign-in"
        class="link-embed__signin-btn"
        @click.stop
      >
        <Button variant="gray" size="s">
          Sign in
        </Button>
      </NuxtLink>
    </Flex>
  </component>
</template>

<style scoped lang="scss">
.link-embed__profile-info {
  flex: 1;
  min-width: 0;
}

.link-embed__signin-btn {
  flex-shrink: 0;
  margin-left: auto;
}
</style>
