<script setup lang="ts">
import { Alert, Button, Card, Flex } from '@dolanske/vui'
import { ref } from 'vue'
import BannerEditor from '@/components/Profile/Banner/BannerEditor.vue'

definePageMeta({ layout: 'default' })

const userId = useUserId()

// ── Banner ────────────────────────────────────────────────────────────────────

const editorOpen = ref(false)
const bannerUrl = ref<string | null>(null)
const bannerDeleted = ref(false)

function onBannerSaved(url: string) {
  bannerUrl.value = `${url}?t=${Date.now()}`
  bannerDeleted.value = false
}

function onBannerDeleted() {
  bannerUrl.value = null
  bannerDeleted.value = true
  setTimeout(() => {
    bannerDeleted.value = false
  }, 3000)
}
</script>

<template>
  <div class="playground-page">
    <div class="container container-m">
      <Flex column gap="xl">
        <Flex column :gap="0">
          <h1>Forum Banner Editor</h1>
          <p class="text-color-light">
            Create a banner image that appears below your forum replies.
          </p>
        </Flex>

        <Alert v-if="!userId" variant="warning">
          You must be signed in to edit your banner.
        </Alert>

        <Card>
          <template #header>
            <h2>Banner Image</h2>
          </template>

          <Flex column gap="m">
            <p class="text-color-light text-s">
              Create a banner image shown under your forum replies. Banners are 728×48 pixels,
              stored as WebP, and scale to fit smaller screens.
            </p>

            <!-- Current banner preview -->
            <div v-if="bannerUrl" class="playground__banner-preview">
              <img
                :src="bannerUrl"
                alt="Your forum banner"
                class="playground__banner-img"
              >
            </div>

            <Alert v-if="bannerDeleted" variant="success">
              Banner deleted.
            </Alert>

            <div>
              <Button
                variant="accent"
                :disabled="!userId"
                @click="editorOpen = true"
              >
                <Icon name="ph:pencil-simple" />
                {{ bannerUrl ? 'Edit banner' : 'Create banner' }}
              </Button>
            </div>
          </Flex>
        </Card>
      </Flex>
    </div>
  </div>

  <!-- Full-screen banner editor modal (rendered outside the card so it can go truly full-screen) -->
  <BannerEditor
    :open="editorOpen"
    :user-id="userId"
    @saved="onBannerSaved"
    @deleted="onBannerDeleted"
    @close="editorOpen = false"
  />
</template>

<style lang="scss" scoped>
.playground-page {
  padding-block: 128px;
  width: 100%;
}

.playground {
  &__banner-preview {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    overflow: hidden;
    background: var(--color-bg-lowered);
  }

  &__banner-img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 48px;
    object-fit: fill;
  }
}
</style>
