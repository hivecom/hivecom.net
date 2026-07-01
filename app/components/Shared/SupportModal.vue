<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Card, CopyClipboard, Divider, Flex, Modal, Tooltip } from '@dolanske/vui'
import { ref, watch } from 'vue'
import constants from '~~/constants.json'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'
import UserDisplay from './UserDisplay.vue'

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
const isBelowSmall = useBreakpoint('<xs')

const supportDetails = constants.SUPPORT ?? {}
const supportEmail = supportDetails.EMAIL ?? 'contact@hivecom.net'
const ircChannel = supportDetails.IRC_CHANNEL ?? '#staff'
const admins = ref<Tables<'profiles'>[]>([])
const adminsLoading = ref(false)
const adminsError = ref('')

const discordUrl = constants.LINKS?.DISCORD?.url
  ?? constants.PLATFORMS?.DISCORD?.urls?.[0]?.url
  ?? 'https://discord.gg/2xsJcSuUhW'
const teamspeakUrl = constants.PLATFORMS?.TEAMSPEAK?.urls?.[0]?.url
  ?? 'ts3server://eu.ts.hivecom.net'

const { isConnected, joinChannel, seedChannel } = useIrcChat()

const supabase = useSupabaseClient()

async function loadAdmins() {
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
      .select('id, username, public')
      .in('id', adminIds)
      .eq('public', true)

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

// Load admins when modal opens
watch(isOpen, (opened) => {
  if (opened && admins.value.length === 0 && !adminsLoading.value)
    loadAdmins()
}, { once: false })

function handleClose() {
  isOpen.value = false
  emit('close')
}

async function goToChat() {
  if (isConnected.value) {
    joinChannel(ircChannel)
  }
  else {
    seedChannel(ircChannel)
  }
  handleClose()
  await navigateTo('/chat')
}

async function goToStaffChannel() {
  if (isConnected.value) {
    joinChannel('#staff')
  }
  else {
    seedChannel('#staff')
  }
  handleClose()
  await navigateTo('/chat')
}
</script>

<template>
  <Modal
    :open="isOpen" centered :card="{
      headerSeparator: true,
    }" :size="isBelowSmall ? 'screen' : undefined" @close="handleClose"
  >
    <template #header>
      <h3>{{ props.title }}</h3>
    </template>

    <div class="support-modal">
      <p v-if="props.message" class="support-modal__message">
        {{ props.message }}
      </p>

      <Card class="card-bg">
        <h4 class="mb-xs">
          Contact us
        </h4>
        <div class="support-modal__button-list">
          <CopyClipboard :text="supportEmail" confirm class="w-100">
            <Button expand>
              <template #start>
                <Icon name="ph:envelope" />
              </template>
              Email
            </Button>
          </CopyClipboard>
          <Tooltip>
            <Button :expand="isBelowSmall" @click="goToChat">
              <template #start>
                <Icon name="ph:chats-circle" />
              </template>
              Join Chat
            </Button>
            <template #tooltip>
              <p>{{ isConnected ? 'Open' : 'Connect to' }} {{ ircChannel }}</p>
            </template>
          </Tooltip>
          <NuxtLink
            v-if="discordUrl" :to="discordUrl" target="_blank" rel="noopener noreferrer"
            class="support-modal__link"
          >
            <Button :expand="isBelowSmall">
              <template #start>
                <Icon name="ph:discord-logo" />
              </template>
              Discord
            </Button>
          </NuxtLink>
          <NuxtLink
            v-if="teamspeakUrl" :to="teamspeakUrl" target="_blank" rel="noopener noreferrer"
            class="support-modal__link"
          >
            <Button :expand="isBelowSmall">
              <template #start>
                <Icon name="mdi:teamspeak" />
              </template>
              TeamSpeak
            </Button>
          </NuxtLink>
        </div>
      </Card>

      <Card class="support-modal__section card-bg mb-m">
        <h4 class="mb-xs">
          Admins
        </h4>
        <p class="text-color-light text-m support-modal__description">
          Reach out to the admins below directly in <button class="support-modal__link-button" @click="goToChat">
            chat
          </button> or generally on <button class="support-modal__link-button" @click="goToStaffChannel">
            #staff
          </button>.
        </p>
        <Divider class="my-m" />
        <div v-if="adminsLoading" class="support-modal__admin-loading">
          Loading admin list...
        </div>
        <div v-else-if="adminsError" class="support-modal__admin-error">
          {{ adminsError }}
        </div>
        <div v-else class="support-modal__admin-list">
          <UserDisplay v-for="admin in admins" :key="admin.id" :user-id="admin.id" size="s" />
        </div>
      </Card>
    </div>

    <template #footer>
      <Flex gap="s" wrap class="support-modal__actions" align="center" expand>
        <div class="flex-1" />
        <Button variant="gray" :expand="isBelowSmall" @click="handleClose">
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

  &__admin-list {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-l);
  }

  &__button-list {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-m);

    @media (max-width: $breakpoint-s) {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-s);
    }
  }

  &__admin-loading,
  &__admin-error {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    font-style: italic;
    height: 28px;
    line-height: 28px;
  }

  &__admin-error {
    color: var(--color-text-red);
  }

  &__admin-placeholder {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__link {
    display: contents;
  }

  &__description {
    margin: 0;
  }

  &__link-button {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--color-accent);
    cursor: pointer;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:active {
      opacity: 0.8;
    }
  }
}
</style>
