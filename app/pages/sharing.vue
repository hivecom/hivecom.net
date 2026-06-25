<script setup lang="ts">
import { Flex, Spinner, Tab, Tabs } from '@dolanske/vui'
import { ref, useTemplateRef } from 'vue'
import FileDropzone from '@/components/Shared/FileDropzone.vue'
import SharingFileTable from '@/components/Sharing/SharingFileTable.vue'
import SharingKeys from '@/components/Sharing/SharingKeys.vue'
import SharingQuota from '@/components/Sharing/SharingQuota.vue'
import { useDepot } from '@/composables/useDepot'
import { useSessionReady } from '@/composables/useSessionReady'

const user = useSupabaseUser()
const client = useSupabaseClient()
const { navigateToSignIn } = useAuthRedirect()
const { waitForSessionReady } = useSessionReady()

const { baseUrl: depotUrl, host } = useDepot()

const loading = ref(true)

onMounted(async () => {
  await waitForSessionReady()

  if (!user.value) {
    navigateToSignIn()
    return
  }

  const authListener = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session)
      navigateToSignIn()
  })

  onUnmounted(() => {
    authListener.data.subscription.unsubscribe()
  })

  loading.value = false
})

// Bumped by the file table after an upload/delete so the quota row refetches.
const refreshSignal = ref(0)
// Surfaced from the file table so the quota row can show the upload count.
const totalFiles = ref(0)

const activeTab = ref<'files' | 'keys'>('files')

const fileTable = useTemplateRef('fileTable')

// Files dropped anywhere on the page upload to the gateway. Switch to the Files
// tab so the result is visible, then hand off to the table's upload path.
function handleDrop(files: FileList) {
  activeTab.value = 'files'
  fileTable.value?.uploadFiles(files)
}
</script>

<template>
  <div class="page container-l">
    <template v-if="loading">
      <Spinner size="l" />
    </template>

    <template v-else-if="!user">
      <p>Please sign in to manage your sharing.</p>
    </template>

    <FileDropzone v-else label="Drop files to upload to the gateway" @drop="handleDrop">
      <Flex column gap="l" expand>
        <Flex column :gap="0" expand>
          <h1>Sharing</h1>
          <p class="text-color-light">
            Upload things like our chat does to <a :href="depotUrl" target="_blank" rel="noopener">{{ host }}</a> - manage your uploads and API keys here
          </p>
        </Flex>

        <SharingQuota v-model:refresh-signal="refreshSignal" :total="totalFiles" />

        <Tabs v-model="activeTab">
          <Tab value="files">
            Files
          </Tab>
          <Tab value="keys">
            API keys
          </Tab>
        </Tabs>

        <SharingFileTable
          v-show="activeTab === 'files'"
          ref="fileTable"
          v-model:refresh-signal="refreshSignal"
          v-model:total="totalFiles"
        />
        <SharingKeys v-if="activeTab === 'keys'" />
      </Flex>
    </FileDropzone>
  </div>
</template>
