<script setup lang="ts">
import type { SelectOption } from '@dolanske/vui'
import type { Ref } from 'vue'
import { Flex, Table } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import AuthorFilter from '@/components/Admin/Shared/AuthorFilter.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DepotFileTableBase from '@/components/Shared/DepotFileTableBase.vue'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useDepot } from '@/composables/useDepot'

interface ProfileResult {
  id: string
  username: string
}

// Bumped on delete so the page's KPI cards refetch.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { adminListFiles, adminContentTypes, deleteFile } = useDepot()
const { canModerateDepot } = useAdminPermissions()
const { settings } = useDataUserSettings()

// Persisted across sessions in user settings, same as the assets view mode.
const viewMode = ref<'table' | 'grid'>(settings.value.admin_depot_view_mode ?? 'grid')
watch(viewMode, (mode) => {
  settings.value.admin_depot_view_mode = mode
})

// Page size is provided by the admin layout, same as the other admin tables.
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

// ─── Filters ──────────────────────────────────────────────────────────────────

const contentType = ref('')
const authorFilter = ref<ProfileResult | null>(null)

// Populated from the gateway's distinct content types (exact mime strings, since
// the content_type filter matches exactly). Loaded once on mount.
const contentTypeOptions = ref<SelectOption[]>([])

const contentTypeModel = computed<SelectOption[] | undefined>({
  get() {
    const match = contentTypeOptions.value.find(option => option.value === contentType.value)
    return match ? [match] : undefined
  },
  set(selection) {
    contentType.value = selection?.[0]?.value ?? ''
  },
})

async function loadContentTypes() {
  try {
    const types = await adminContentTypes()
    contentTypeOptions.value = types.map(type => ({ label: type, value: type }))
  }
  catch {
    // Non-fatal: the type filter just stays empty if the lookup fails.
  }
}

onBeforeMount(loadContentTypes)

// Layered onto the base listing call, and watched so a change refetches.
function extraParams() {
  return {
    contentType: contentType.value || undefined,
    account: authorFilter.value?.id || undefined,
  }
}
const extraWatchSources = [contentType, () => authorFilter.value?.id]

// Anonymous uploads land under the reserved _anonymous owner with no subject.
function isAnonymous(account: string): boolean {
  return account === '_anonymous' || account === ''
}
</script>

<template>
  <DepotFileTableBase
    v-model:refresh-signal="refreshSignal"
    v-model:view-mode="viewMode"
    :list-files="adminListFiles"
    :delete-file="deleteFile"
    :per-page="adminTablePerPage"
    :can-manage="canModerateDepot"
    empty-message="No uploads found"
    empty-search-message="No uploads found"
    content-type-badge
    delete-consequence-singular="This removes it for everyone and cannot be undone."
    delete-consequence-plural="This removes them for everyone and cannot be undone."
    :extra-params="extraParams"
    :extra-watch-sources="extraWatchSources"
  >
    <template #filters-after>
      <ExpandableSelect
        v-model="contentTypeModel"
        :options="contentTypeOptions"
        placeholder="Filter by type"
        single
        show-clear
      />
      <Flex class="depot-author-filter">
        <AuthorFilter v-model="authorFilter" />
      </Flex>
    </template>

    <template #extra-head>
      <Table.Head>Uploader</Table.Head>
    </template>

    <template #extra-cell="{ file, openDetails }">
      <Table.Cell @click="openDetails(file)">
        <span v-if="isAnonymous(file.uploader_account)" class="text-color-lightest text-s">anonymous</span>
        <UserLink v-else :user-id="file.uploader_account" show-avatar class="text-s" />
      </Table.Cell>
    </template>

    <template #drawer-overview="{ file }">
      <DetailRow v-if="file" label="Uploaded by">
        <span v-if="isAnonymous(file.uploader_account)" class="text-color-lightest">anonymous</span>
        <UserLink v-else :user-id="file.uploader_account" show-avatar class="text-s" />
      </DetailRow>
    </template>
  </DepotFileTableBase>
</template>

<style scoped lang="scss">
// Keep the author dropdown compact, in line with the search and type inputs.
.depot-author-filter {
  width: 240px;
}
</style>
