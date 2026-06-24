<script setup lang="ts">
import type { Ref } from 'vue'
import type { DepotUploader } from '@/composables/useDepot'

import { Alert, Flex, paginate, Pagination, Spinner, Table } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useDepot } from '@/composables/useDepot'
import { formatBytes } from '@/lib/storageAssets'

// Refetch when a delete elsewhere on the page changes the totals.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { adminListUploaders } = useDepot()
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

const loading = ref(false)
const initialLoad = ref(true)
const errorMessage = ref('')
const users = ref<DepotUploader[]>([])
const total = ref(0)
const page = ref(1)

async function fetchUploaders() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { users: rows, total: count } = await adminListUploaders({
      limit: adminTablePerPage.value,
      offset: (page.value - 1) * adminTablePerPage.value,
    })
    users.value = rows
    total.value = count
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Could not load uploaders'
    users.value = []
    total.value = 0
  }
  finally {
    loading.value = false
    initialLoad.value = false
  }
}

onBeforeMount(fetchUploaders)
watch(() => refreshSignal.value, fetchUploaders)

const paginationState = computed(() => paginate(total.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => total.value > adminTablePerPage.value)

function setPage(p: number) {
  page.value = p
  void fetchUploaders()
}

// Anonymous uploads aggregate under the reserved _anonymous owner; no profile.
function isAnonymous(account: string): boolean {
  return account === '_anonymous' || account === ''
}
</script>

<template>
  <Flex column gap="s" expand>
    <Flex x-between y-center gap="s" expand>
      <span class="text-color-light text-s">Uploaders ranked by storage used</span>
      <Flex gap="s" y-center>
        <Spinner v-if="loading && !initialLoad" size="s" />
        <span class="text-color-lighter text-s" style="text-wrap: nowrap;">Total {{ total }}</span>
      </Flex>
    </Flex>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Flex v-if="initialLoad" x-center y-center expand style="min-height: 160px;">
      <Spinner />
    </Flex>

    <Alert v-else-if="users.length === 0" variant="info">
      No uploaders found
    </Alert>

    <TableContainer v-else>
      <Table.Root separate-cells>
        <template #header>
          <Table.Head>User</Table.Head>
          <Table.Head>Uploads</Table.Head>
          <Table.Head>Storage</Table.Head>
        </template>

        <template #body>
          <tr v-for="u in users" :key="`${u.issuer}/${u.account}`">
            <Table.Cell>
              <span v-if="isAnonymous(u.account)" class="text-color-lightest">anonymous</span>
              <UserLink v-else :user-id="u.account" show-avatar />
            </Table.Cell>
            <Table.Cell>{{ u.files }}</Table.Cell>
            <Table.Cell>{{ formatBytes(u.bytes) }}</Table.Cell>
          </tr>
        </template>

        <template v-if="shouldShowPagination" #pagination>
          <Pagination :pagination="paginationState" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>
  </Flex>
</template>
