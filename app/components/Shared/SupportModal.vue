<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Card, CopyClipboard, Divider, Flex, Modal } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import constants from '~~/constants.json'
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

      <Card class="support-modal__section card-bg mb-m">
        <h4 class="mb-xs">
          Admins
        </h4>
        <p class="text-color-light">
          Reach out to any of the admins below on Discord or TeamSpeak if that works better for you.
        </p>
        <Divider />
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
          <div v-else class="support-modal__admin-list">
            <UserDisplay v-for="admin in admins" :key="admin.id" :user-id="admin.id" size="s" />
          </div>
        </template>
      </Card>
    </div>

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
        <a :href="ircUrl" target="_blank" rel="noopener noreferrer" class="support-modal__link">
          <Button :expand="isBelowSmall" :data-title-top="`Join the ${ircChannel} channel`">
            <template #start>
              <Icon name="ph:chats-circle" />
            </template>
            Join IRC
          </Button>
        </a>
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
@use '@/assets/breakpoints.scss' as *;

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
}
</style>
