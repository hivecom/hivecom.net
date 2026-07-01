<script setup lang="ts">
import type { Ref } from 'vue'
import { Button, pushToast, Tooltip } from '@dolanske/vui'
import { computed, inject, ref, useTemplateRef } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import DepotFileTableBase from '@/components/Shared/DepotFileTableBase.vue'
import SharingRulesModal from '@/components/Shared/SharingRulesModal.vue'
import { useDepot } from '@/composables/useDepot'
import { useSharingRulesGate } from '@/composables/useSharingRulesGate'

// Bumped on upload/delete so the page's quota cards refetch.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
// Surfaced to the page so the quota row can show the upload count.
const total = defineModel<number>('total', { default: 0 })

const { listFiles, uploadFile, deleteFile, wipeMyFiles } = useDepot()

// Page size matches the admin tables where a layout provides it; the default
// covers the standalone sharing page.
const perPage = inject<Ref<number>>('adminTablePerPage', computed(() => 12))

// The base table owns all the listing/sort/delete state; we drive it for the
// upload and wipe-all actions that are specific to your own files. Typed by the
// methods it exposes, since a generic component has no usable InstanceType.
const table = useTemplateRef<{
  handleUploaded: () => Promise<void>
  handleExternalWipe: () => Promise<void>
}>('table')

// ─── Upload ───────────────────────────────────────────────────────────────────

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const uploading = ref(false)

// Uploads are gated on agreeing to the sharing rules via the shared gate. The
// gate owns the modal + agreement state; here we just funnel actions through it.
const {
  open: rulesModalOpen,
  agreed: agreedToRules,
  run: runGated,
  handleAgreed: handleRulesAgreed,
  handleCancelled: handleRulesCancelled,
} = useSharingRulesGate()

// The Upload button prompts for agreement before the file picker even opens.
function pickFiles() {
  runGated(() => fileInput.value?.click())
}

// Public entry for the button (after picking) and the page-level dropzone.
// Prompts first if the rules aren't agreed yet, then runs the upload.
function uploadFiles(files: FileList | File[]) {
  const picked = Array.from(files)
  if (!picked.length)
    return
  runGated(() => void performUpload(picked))
}

// Uploads each file in turn, surfacing per-file failures, then has the table
// jump to the newest and refresh.
async function performUpload(picked: File[]) {
  if (uploading.value)
    return

  uploading.value = true
  let succeeded = 0
  try {
    for (const file of picked) {
      try {
        await uploadFile(file)
        succeeded++
      }
      catch (err) {
        pushToast(`Failed to upload ${file.name}`, {
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    if (succeeded > 0) {
      pushToast(`Uploaded ${succeeded} file${succeeded === 1 ? '' : 's'}`)
      await table.value?.handleUploaded()
    }
  }
  finally {
    uploading.value = false
  }
}

function handleFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = input.files ? Array.from(input.files) : []
  // Reset so picking the same file again still fires change.
  input.value = ''
  // pickFiles already passed the gate, so go straight to the upload.
  if (picked.length)
    void performUpload(picked)
}

// Exposed so the sharing page's dropzone can funnel dropped files through the
// same gated upload path as the button.
defineExpose({ uploadFiles })

// ─── Wipe all ─────────────────────────────────────────────────────────────────

const showWipeModal = ref(false)
const wiping = ref(false)

// Wipes every one of your uploads in a single gateway call, then resets the
// table. The nuclear option behind a confirm, distinct from the per-file and
// bulk-selection deletes the base table owns.
async function handleWipeAll() {
  wiping.value = true
  try {
    const { deleted } = await wipeMyFiles()
    pushToast(`Wiped ${deleted} upload${deleted === 1 ? '' : 's'}`)
    showWipeModal.value = false
    await table.value?.handleExternalWipe()
  }
  catch (err) {
    pushToast(err instanceof Error ? err.message : 'Could not wipe uploads')
  }
  finally {
    wiping.value = false
  }
}
</script>

<template>
  <div class="sharing-file-table">
    <DepotFileTableBase
      ref="table"
      v-model:refresh-signal="refreshSignal"
      v-model:total="total"
      :list-files="listFiles"
      :delete-file="deleteFile"
      :per-page="perPage"
      :can-manage="true"
      :hide-uploader="true"
      filters-gap="xs"
      empty-message="No uploads yet. Hit Upload to add your first file."
      delete-consequence-singular="The public link will stop working and this cannot be undone."
      delete-consequence-plural="Their public links will stop working and this cannot be undone."
    >
      <template #filters-before="{ isMobile }">
        <Button variant="accent" :loading="uploading" :expand="isMobile" @click="pickFiles">
          <template #start>
            <Icon name="ph:upload-simple" />
          </template>
          Upload
        </Button>
        <input
          ref="fileInput"
          type="file"
          multiple
          hidden
          @change="handleFilesPicked"
        >
      </template>

      <!-- On desktop the wipe action sits in the toolbar as an icon button; on
           mobile it moves below the table where there's room for a label. -->
      <template #toolbar-actions="{ isMobile }">
        <Tooltip v-if="!isMobile">
          <Button
            square
            size="s"
            variant="danger"
            outline
            :disabled="total === 0 || wiping"
            @click="showWipeModal = true"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete every one of your uploads</p>
          </template>
        </Tooltip>
      </template>

      <template #below-table="{ isMobile }">
        <Button
          v-if="isMobile"
          expand
          variant="danger"
          outline
          :disabled="total === 0 || wiping"
          @click="showWipeModal = true"
        >
          <template #start>
            <Icon name="ph:trash" />
          </template>
          Delete all uploads
        </Button>
      </template>
    </DepotFileTableBase>

    <ConfirmModal
      v-model:open="showWipeModal"
      title="Wipe all uploads"
      :description="`Permanently delete all ${total} of your uploads? Every public link will stop working and this cannot be undone.`"
      confirm-text="Wipe all"
      cancel-text="Cancel"
      :confirm-loading="wiping"
      destructive
      @confirm="handleWipeAll"
    />

    <SharingRulesModal
      v-model:open="rulesModalOpen"
      :show-agree-button="agreedToRules !== true"
      @confirm="handleRulesAgreed"
      @cancel="handleRulesCancelled"
    />
  </div>
</template>

<style scoped lang="scss">
// The page lays the table out in a Flex column that doesn't stretch a plain
// block, so the wrapper has to claim the full width itself.
.sharing-file-table {
  width: 100%;
}
</style>
