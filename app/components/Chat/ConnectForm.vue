<script setup lang="ts">
import { Button, Divider, Flex, Input } from '@dolanske/vui'
import { useDataUser } from '@/composables/useDataUser'
import { useIrcChat } from '@/composables/useIrcChat'

const { WS_URL, connState, inputNick, inputChannel, connect, connectAsAnon } = useIrcChat()

const userId = useUserId()
const { user } = useDataUser(userId)

const connecting = computed(() => connState.value === 'connecting')

// Anon mode is shown when a signed-in user explicitly chooses to skip auth.
const anonMode = ref(false)
const anonNick = ref('')

function enterAnonMode() {
  anonNick.value = `anon-${Math.random().toString(36).slice(2, 7)}`
  anonMode.value = true
}

function onAnonConnect() {
  if (!anonNick.value.trim() || !inputChannel.value.trim())
    return
  // Override the shared nick so openSocket uses the anon nick, not the
  // signed-in username that ensureNick may have seeded.
  inputNick.value = anonNick.value.trim()
  connectAsAnon()
}

// For the signed-out form - channel input stays shared.
function onSignedOutConnect() {
  if (inputNick.value.trim() && inputChannel.value.trim())
    connectAsAnon()
}
</script>

<template>
  <Flex column gap="m" expand>
    <!-- Signed in, normal auth path -->
    <template v-if="user && !anonMode">
      <Flex column gap="xs">
        <h4 class="chat-connect__title">
          Connect to chat
        </h4>
        <p class="chat-connect__hint">
          You'll join as <strong>{{ user.username }}</strong> using your Hivecom account.
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
      <span class="chat-connect__server">{{ WS_URL }}</span>
    </template>

    <!-- Signed in, anon path: pick a nick -->
    <template v-else-if="user && anonMode">
      <Flex column gap="xs">
        <h4 class="chat-connect__title">
          Connect as anon
        </h4>
        <p class="chat-connect__hint">
          Choose a nickname - you won't be verified.
        </p>
      </Flex>
      <Flex gap="s" wrap expand>
        <Flex column gap="xs" class="chat-connect__field">
          <label class="chat-connect__label">Nickname</label>
          <Input
            v-model="anonNick"
            expand
            placeholder="anon-xxxxx"
            @keydown.enter="onAnonConnect"
          />
        </Flex>
        <Flex column gap="xs" class="chat-connect__field">
          <label class="chat-connect__label">Channel</label>
          <Input v-model="inputChannel" expand placeholder="#general" @keydown.enter="onAnonConnect" />
        </Flex>
      </Flex>
      <Flex y-center gap="s" wrap>
        <Button
          variant="accent"
          :loading="connecting"
          :disabled="!anonNick.trim() || !inputChannel.trim()"
          @click="onAnonConnect"
        >
          Connect
        </Button>
        <Button variant="gray" plain :disabled="connecting" @click="anonMode = false">
          Back
        </Button>
      </Flex>
      <span class="chat-connect__server">{{ WS_URL }}</span>
    </template>

    <!-- Signed out: classic nick + channel form -->
    <template v-else>
      <Flex gap="s" wrap expand>
        <Flex column gap="xs" class="chat-connect__field">
          <label class="chat-connect__label">Nickname</label>
          <Input v-model="inputNick" expand placeholder="your-nick" @keydown.enter="onSignedOutConnect" />
        </Flex>
        <Flex column gap="xs" class="chat-connect__field">
          <label class="chat-connect__label">Channel</label>
          <Input v-model="inputChannel" expand placeholder="#general" @keydown.enter="onSignedOutConnect" />
        </Flex>
      </Flex>
      <Flex y-center gap="s" wrap>
        <Button
          variant="accent"
          :loading="connecting"
          :disabled="!inputNick.trim() || !inputChannel.trim()"
          @click="onSignedOutConnect"
        >
          Connect
        </Button>
        <span class="chat-connect__server">{{ WS_URL }}</span>
      </Flex>
      <Divider />
      <p class="chat-connect__hint">
        Sign in to a Hivecom account to chat with a verified identity.
      </p>
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-connect {
  &__field {
    flex: 1;
    min-width: 140px;
  }

  &__title {
    margin: 0;
  }

  &__label {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__hint {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__server {
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
  }
}
</style>
