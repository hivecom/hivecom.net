<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import constants from '~~/constants.json'
import UserLink from '@/components/Shared/UserLink.vue'

interface Props {
  message?: string
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Need help?',
  message: '',
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const supportDetails = constants.SUPPORT ?? {}
const supportEmail = supportDetails.EMAIL ?? 'contact@hivecom.net'
const ircChannel = supportDetails.IRC_CHANNEL ?? '#staff'
const ircUrl = supportDetails.IRC_URL ?? 'irc://irc.hivecom.net:6697/#staff'
const admins = ref<Tables<'profiles'>[]>([])
const adminsLoading = ref(false)
const adminsError = ref('')
const user = useSupabaseUser()
const canViewAdmins = computed(() => Boolean(user.value))

const discordUrl = constants.LINKS?.DISCORD?.url
  ?? constants.PLATFORMS?.DISCORD?.urls?.[0]?.url
  ?? 'https://discord.gg/2xsJcSuUhW'
const teamspeakUrl = constants.PLATFORMS?.TEAMSPEAK?.urls?.[0]?.url
  ?? 'ts3server://eu.ts.hivecom.net'

const supabase = useSupabaseClient()

async function loadAdmins() {
  if (!canViewAdmins.value) {
    admins.value = []
    adminsError.value = ''
    adminsLoading.value = false
    return
  }

  adminsLoading.value = true
  adminsError.value = ''

  try {
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')

    if (rolesError)
      throw rolesError

    const adminIds = rolesData?.map(role => role.user_id).filter(Boolean) ?? []

    if (adminIds.length === 0) {
      admins.value = []
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', adminIds)

    if (profilesError)
      throw profilesError

    admins.value = profilesData ?? []
  }
  catch (error) {
    console.error('Failed to load admins:', error)
    adminsError.value = error instanceof Error ? error.message : 'Failed to load admins'
  }
  finally {
    adminsLoading.value = false
  }
}

onMounted(() => {
  if (canViewAdmins.value)
    loadAdmins()
})

watch(user, (newUser) => {
  if (newUser) {
    loadAdmins()
  }
  else {
    admins.value = []
    adminsError.value = ''
    adminsLoading.value = false
  }
})

function handleClose() {
  isOpen.value = false
  emit('close')
}
</script>

<template>
  <Modal
    :open="isOpen" centered :card="{ headerSeparator: true,
                                     footerSeparator: true }" @close="handleClose"
  >
    <template #header>
      <h3>{{ props.title }}</h3>
    </template>

    <div class="support-modal">
      <p v-if="props.message" class="support-modal__message">
        {{ props.message }}
      </p>

      <div class="support-modal__section">
        <h4>Contact</h4>
        <p>
          You can email us at
          <a :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
          or hop into IRC at
          <a :href="ircUrl" target="_blank" rel="noopener noreferrer">{{ ircChannel }}</a>.
        </p>
      </div>

      <div class="support-modal__section">
        <h4>Admins</h4>
        <p>
          Reach out to any of the admins below on Discord or TeamSpeak if that works better for you.
        </p>
        <div v-if="!canViewAdmins" class="support-modal__admin-placeholder">
          Sign in to view the current admin roster.
        </div>
        <template v-else>
          <div v-if="adminsLoading" class="support-modal__admin-loading">
            Loading admin list...
          </div>
          <div v-else-if="adminsError" class="support-modal__admin-error">
            {{ adminsError }}
          </div>
          <ul v-else class="support-modal__admin-list">
            <li v-for="admin in admins" :key="admin.id">
              <UserLink :user-id="admin.id" size="s" />
            </li>
          </ul>
        </template>
      </div>
    </div>

    <template #footer>
      <Flex gap="s" wrap class="support-modal__actions" align="center">
        <a :href="`mailto:${supportEmail}`">
          <Button>
            <template #start>
              <Icon name="ph:envelope" />
            </template>
            Email Support
          </Button>
        </a>
        <a :href="ircUrl" target="_blank" rel="noopener noreferrer">
          <Button>
            <template #start>
              <Icon name="ph:chats-circle" />
            </template>
            Join IRC
          </Button>
        </a>
        <NuxtLink
          v-if="discordUrl"
          :to="discordUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button>
            <template #start>
              <Icon name="ph:discord-logo" />
            </template>
            Discord
          </Button>
        </NuxtLink>
        <NuxtLink
          v-if="teamspeakUrl"
          :to="teamspeakUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button>
            <template #start>
              <Icon name="mdi:teamspeak" />
            </template>
            TeamSpeak
          </Button>
        </NuxtLink>

        <div class="flex-1" />
        <Button variant="gray" @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.support-modal {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);

  &__message {
    margin: 0;
    font-size: var(--font-size-m);
    color: var(--color-text);
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__actions {
    margin-top: var(--space-s);
  }

  &__admin-list {
    margin: 0;
    padding-left: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);

    li {
      list-style: disc;
    }
  }

  &__admin-loading,
  &__admin-error {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    font-style: italic;
  }

  &__admin-error {
    color: var(--color-text-red);
  }

  &__admin-placeholder {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }
}
</style>
