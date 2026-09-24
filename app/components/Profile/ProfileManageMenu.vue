<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Dropdown, DropdownItem, pushToast } from '@dolanske/vui'
import { computed, ref } from 'vue'
import BanUserModal from '@/components/Admin/Users/BanUserModal.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { usePermissions } from '@/composables/usePermissions'

const props = defineProps<{
  profile: Tables<'profiles'>
}>()

const emit = defineEmits<{
  updated: []
}>()

const supabase = useSupabaseClient()
const userId = useUserId()
const { hasPermission } = usePermissions()

// Same gate as the admin user actions. Nobody bans themselves from here.
const canModerate = computed(() =>
  hasPermission('users.update') && userId.value !== props.profile.id,
)

const banTarget = computed(() => ({ id: props.profile.id, username: props.profile.username }))

const showBanModal = ref(false)
const showUnbanConfirm = ref(false)
const actionLoading = ref(false)

// admin-user-ban handles both directions. 'none' lifts the ban.
async function setBan(banDuration: string, banReason?: string) {
  actionLoading.value = true

  try {
    const { error } = await supabase.functions.invoke('admin-user-ban', {
      method: 'POST',
      body: {
        userId: props.profile.id,
        banDuration,
        banReason,
      },
    })

    if (error)
      throw error

    pushToast(banDuration === 'none' ? `Unbanned ${props.profile.username}` : `Banned ${props.profile.username}`)
    emit('updated')
  }
  catch (error) {
    pushToast(banDuration === 'none' ? 'Failed to unban user' : 'Failed to ban user', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    actionLoading.value = false
  }
}

async function handleBan(banData: { duration: string, reason?: string }) {
  showBanModal.value = false
  await setBan(banData.duration, banData.reason)
}

async function handleUnban() {
  showUnbanConfirm.value = false
  await setBan('none')
}
</script>

<template>
  <template v-if="canModerate">
    <Dropdown>
      <template #trigger="{ toggle }">
        <Button size="s" variant="gray" :loading="actionLoading" @click="toggle">
          Manage
        </Button>
      </template>
      <DropdownItem v-if="!profile.banned" variant="danger" @click="showBanModal = true">
        Ban
      </DropdownItem>
      <DropdownItem v-else @click="showUnbanConfirm = true">
        Unban
      </DropdownItem>
      <DropdownItem @click="navigateTo(`/admin/users?user=${profile.id}`)">
        Open in admin
      </DropdownItem>
    </Dropdown>

    <BanUserModal
      v-model:open="showBanModal"
      :user="banTarget"
      @ban="handleBan"
    />

    <ConfirmModal
      v-model:open="showUnbanConfirm"
      title="Unban user"
      :description="`Lift the ban on ${profile.username}?`"
      confirm-text="Unban"
      @confirm="handleUnban"
    />
  </template>
</template>
