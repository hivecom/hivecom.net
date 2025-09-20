<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Card, Flex } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'

interface Props {
  profile: Tables<'profiles'>
  isOwnProfile: boolean
}

const _props = defineProps<Props>()

const emit = defineEmits<{
  openEditSheet: []
}>()
</script>

<template>
  <Card separators class="about-section">
    <template #header>
      <Flex x-between y-center>
        <Flex>
          <h3>About</h3>
          <Button v-if="isOwnProfile" size="s" variant="gray" @click="emit('openEditSheet')">
            Edit Content
          </Button>
        </Flex>
        <Icon name="ph:user-circle" />
      </Flex>
    </template>

    <div v-if="profile.markdown" class="profile-markdown">
      <MDRenderer skeleton-height="504px" :md="profile.markdown" />
    </div>
    <div v-else-if="isOwnProfile" class="empty-state">
      <p class="color-text-lighter text-s">
        Add content to your profile to tell others about yourself!
      </p>
    </div>
    <p v-else class="color-text-lighter text-s">
      This user hasn't added any content yet. Surely they will soon!
    </p>
  </Card>
</template>

<style lang="scss" scoped>
.about-section {
  min-height: 600px;
}

.profile-markdown {
  line-height: 1.6;
}

.empty-state {
  text-align: center;
  padding: var(--space-l);

  p {
    margin-bottom: var(--space-m);
  }
}
</style>
