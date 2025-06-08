<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, defineTable, searchString, Table } from '@dolanske/vui'

// Data setup
const loading = ref(false)
const users = ref<Tables<'profiles'>[]>([])
const errorMessage = ref('')

const supabase = useSupabaseClient()

async function fetchUsers() {
  loading.value = true

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at')

    if (error)
      throw error

    users.value = data
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading games'
  }
  finally {
    loading.value = false
  }
}

onBeforeMount(fetchUsers)

// Table setup
function mapUserRow(row: Tables<'profiles'>) {
  return {
    Name: row.username,
    Supporter: !!row.patreon_id,
    // Roles:
    Created: formatDate(row.created_at),
  }
}

const search = ref('')

const modelledUsers = computed(() => {
  let data = users.value

  if (search.value) {
    data = users.value.filter(row => searchString(row.username, search.value))
  }

  return data.map(mapUserRow)
})

const { headers, rows } = defineTable(modelledUsers)
</script>

<template>
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <TableContainer v-if="rows.length > 0">
    <Table.Root :loading>
      <template #header>
        <Table.Head v-for="header in headers" :key="header.label" :header sort />
      </template>

      <template #body>
        <tr v-for="user in rows" :key="user.Name">
          <Table.Cell>{{ user.Name }}</Table.Cell>
          <Table.Cell>{{ user.Supporter ? 'Yes' : 'No' }}</Table.Cell>
          <Table.Cell>{{ user.Created }}</Table.Cell>
        </tr>
      </template>
    </Table.Root>
  </TableContainer>
</template>
