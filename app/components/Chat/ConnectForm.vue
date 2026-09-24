<script setup lang="ts">
import { Button, Checkbox, Divider, Flex, Input } from '@dolanske/vui'
import SignInForm from '@/components/Auth/SignInForm.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{
  // When true (full page / exclusive surfaces), the "Sign in" affordance swaps in
  // the embedded sign-in form instead of linking out to /auth/sign-in. The compact
  // navbar sheet leaves this off and keeps the external link.
  inlineSignIn?: boolean
}>()

const { connState, inputNick, inputChannel, connect, connectAsAnon, hadAccount } = useIrcChat()
const route = useRoute()

// Auto-connect is a regular DB-backed user setting, so toggling it here applies
// everywhere immediately.
const { settings } = useDataUserSettings()

const userId = useUserId()
const { user } = useDataUser(userId)

const connecting = computed(() => connState.value === 'connecting')

// Anon mode is shown when a signed-in user explicitly chooses to skip auth.
const anonMode = ref(false)
const anonNick = ref('')

// Inline sign-in (signed-out surfaces only). A user who has connected with an
// account on this browser before defaults to the sign-in form, so an expired
// session doesn't strand them on the guest form.
const signInMode = ref(false)
onMounted(() => {
  if (props.inlineSignIn && hadAccount.value && !user.value)
    signInMode.value = true
})

function enterAnonMode() {
  anonNick.value = `anon-${Math.random().toString(36).slice(2, 7)}`
  anonMode.value = true
}

function onAnonConnect() {
  if (!anonNick.value.trim())
    return

  // Override the shared nick so openSocket uses the anon nick, not the
  // signed-in username that ensureNick may have seeded.
  inputNick.value = anonNick.value.trim()
  connectAsAnon()
}

// Signed-out form. The channel input stays shared.
function onSignedOutConnect() {
  if (inputNick.value.trim())
    connectAsAnon()
}
</script>

<template>
  <Flex column expand>
    <!--
      Client-only: the branch depends on client state (`user` from the profile
      cache, nick/channel from localStorage). SSR renders the signed-out branch
      with a disabled Connect button, and on a warm-cache reload the hydration
      mismatch strands that `disabled` attribute on the auth branch's button.
    -->
    <ClientOnly>
      <Transition name="connect-state" mode="out-in">
        <!-- Signed in, normal auth path -->
        <Flex v-if="user && !anonMode" key="auth" column gap="m" expand>
          <Flex column gap="xs">
            <h4 class="chat-connect__title">
              Connect to chat
            </h4>
            <p class="text-s text-color-light">
              You'll connect as <strong class="text-s">{{ user.username }}</strong> using your Hivecom account<template v-if="inputChannel">
                , joining <strong class="text-s">{{ inputChannel }}</strong>
              </template>.
            </p>
          </Flex>
          <Flex y-center gap="s" wrap>
            <Button variant="accent" :loading="connecting" @click="connect()">
              <template #icon>
                <Icon name="ph:plugs-connected" />
              </template>
              Connect as {{ user.username }}
            </Button>
            <Button variant="gray" plain :disabled="connecting" @click="enterAnonMode">
              Continue as anon
            </Button>
          </Flex>
          <Checkbox
            v-model="settings.chat_autoconnect"
            accent
            label="Connect automatically next time"
          />
        </Flex>

        <!-- Signed in, anon path: pick a nick -->
        <Flex v-else-if="user && anonMode" key="anon" column gap="m" expand>
          <Flex column gap="xs">
            <h4 class="chat-connect__title">
              Connect as anon
            </h4>
            <p class="text-s text-color-light">
              Choose a nickname - you won't be verified.
            </p>
          </Flex>
          <Flex gap="s" wrap expand>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Nickname</label>
              <Input
                v-model="anonNick"
                expand
                placeholder="anon-xxxxx"
                @keydown.enter="onAnonConnect"
              />
            </Flex>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Channel <span class="text-color-lighter">(optional)</span></label>
              <Input v-model="inputChannel" expand placeholder="#public" @keydown.enter="onAnonConnect" />
            </Flex>
          </Flex>
          <Flex y-center gap="s" wrap>
            <Button
              variant="accent"
              :loading="connecting"
              :disabled="!anonNick.trim()"
              @click="onAnonConnect"
            >
              Connect
            </Button>
            <Button variant="gray" plain :disabled="connecting" @click="anonMode = false">
              Back
            </Button>
          </Flex>
        </Flex>

        <!-- Signed out, inline sign-in: embedded sign-in form (no page chrome) -->
        <Flex v-else-if="props.inlineSignIn && signInMode" key="signin" column gap="xs" expand>
          <SignInForm stay-on-success :redirect="route.path" @success="signInMode = false" />
          <Flex x-center exapnd>
            <Button variant="gray" plain @click="signInMode = false">
              Continue as guest
            </Button>
          </Flex>
        </Flex>

        <!-- Signed out: classic nick + channel form -->
        <Flex v-else key="signedout" column gap="m" expand>
          <Flex gap="s" wrap expand>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Nickname</label>
              <Input v-model="inputNick" expand placeholder="your-nick" @keydown.enter="onSignedOutConnect" />
            </Flex>
            <Flex column gap="xs" class="chat-connect__field">
              <label class="text-s text-color-light">Channel <span class="text-color-lighter">(optional)</span></label>
              <Input v-model="inputChannel" expand placeholder="#public" @keydown.enter="onSignedOutConnect" />
            </Flex>
          </Flex>
          <Flex y-center gap="s" wrap>
            <Button
              variant="accent"
              :loading="connecting"
              :disabled="!inputNick.trim()"
              @click="onSignedOutConnect"
            >
              Connect
            </Button>
          </Flex>
          <Divider />
          <p class="text-s text-color-light">
            <button
              v-if="props.inlineSignIn"
              type="button"
              class="chat-connect__link text-color-accent"
              @click="signInMode = true"
            >
              Sign in
            </button>
            <NuxtLink v-else to="/auth/sign-in">
              Sign in
            </NuxtLink> to a Hivecom account to chat with a verified identity.
          </p>
        </Flex>
      </Transition>
    </ClientOnly>
  </Flex>
</template>

<style lang="scss" scoped>
.connect-state-enter-active,
.connect-state-leave-active {
  transition: opacity var(--transition);
}

.connect-state-enter-from,
.connect-state-leave-to {
  opacity: 0;
}

.chat-connect {
  &__field {
    flex: 1;
    min-width: 140px;
  }

  &__title {
    margin: 0;
  }

  &__link {
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
  }
}
</style>
