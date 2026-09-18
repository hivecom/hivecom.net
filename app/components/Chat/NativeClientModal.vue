<script setup lang="ts">
import { Button, Divider, Flex, Modal } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataUser } from '@/composables/useDataUser'
import { useIrcChat } from '@/composables/useIrcChat'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [], openIdentity: [] }>()

const isMobile = useBreakpoint('<s')
const { account } = useIrcChat()

// The IRC account is the Hivecom username. Before connecting there is no SASL
// account yet, so fall back to the profile so the commands still read right.
const userId = useUserId()
const { user } = useDataUser(userId)
const accountName = computed(() => account.value || user.value?.username || 'username')
</script>

<template>
  <Modal :open="open" :size="isMobile ? 'screen' : 'l'" @close="emit('close')">
    <template #header>
      <h4 style="margin: 0">
        Native clients
      </h4>
    </template>

    <Flex column gap="l" expand>
      <p class="text-s text-color-light">
        Any IRC client can connect to Hivecom chat. The account you use here is the same one you sign in with there, it just needs a password first.
      </p>

      <!-- Server -->
      <Flex column gap="xs" expand>
        <span class="native-client-modal__label">Server</span>
        <dl class="native-client-modal__facts">
          <dt>Host</dt>
          <dd><code>irc.hivecom.net</code></dd>
          <dt>Port</dt>
          <dd><code>6697</code></dd>
          <dt>TLS</dt>
          <dd>Required, 1.2 or newer</dd>
        </dl>
      </Flex>

      <Divider />

      <!-- Account -->
      <Flex column gap="xs" expand>
        <span class="native-client-modal__label">Account</span>
        <p class="text-s text-color-light">
          Your account name is your Hivecom username, <strong class="text-s">{{ accountName }}</strong>. Nicks are tied to accounts on this server, so use the same value as your nick.
        </p>
      </Flex>

      <Divider />

      <!-- Password -->
      <Flex column gap="s" expand>
        <span class="native-client-modal__label">Set a password</span>
        <p class="text-s text-color-light">
          Signing in on the website never asks for one, so the account has no password yet. Get one through a reset code sent to your email.
        </p>
        <ol class="native-client-modal__steps">
          <li>
            <Flex y-center x-between gap="m" expand>
              <span class="text-s text-color-light">
                Link your email under <strong class="text-s">Identity</strong> if you haven't. The reset code goes to that address.
              </span>
              <Button size="s" variant="gray" @click="emit('openIdentity')">
                Open Identity
              </Button>
            </Flex>
          </li>
          <li>
            <span class="text-s text-color-light">Request a code from any chat buffer here. One request per hour.</span>
            <code class="native-client-modal__cmd">/msg NickServ SENDPASS {{ accountName }}</code>
          </li>
          <li>
            <span class="text-s text-color-light">Set the password with the code from the email.</span>
            <code class="native-client-modal__cmd">/msg NickServ RESETPASS {{ accountName }} &lt;code&gt; &lt;new password&gt;</code>
          </li>
        </ol>
        <p class="text-xs text-color-lighter">
          Change it later with <code>/msg NickServ PASSWD &lt;current&gt; &lt;new&gt; &lt;new&gt;</code>.
        </p>
      </Flex>

      <Divider />

      <!-- Client setup -->
      <Flex column gap="s" expand>
        <span class="native-client-modal__label">Sign in from your client</span>
        <p class="text-s text-color-light">
          Pick <strong class="text-s">SASL PLAIN</strong> as the login method, with your account name as the username and the password you just set. In HexChat that's the "SASL PLAIN (username + password)" option in the network settings.
        </p>
        <p class="text-s text-color-light">
          If your client has no SASL support, set the server password to <code>{{ accountName }}:&lt;password&gt;</code> instead, or identify after connecting:
        </p>
        <code class="native-client-modal__cmd">/msg NickServ IDENTIFY {{ accountName }} &lt;password&gt;</code>
        <p class="text-xs text-color-lighter">
          The website keeps signing you in through your Hivecom session. Setting a password doesn't change that.
        </p>
      </Flex>
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
.native-client-modal {
  &__label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-xxs) var(--space-m);
    margin: 0;
    font-size: var(--font-size-s);

    dt {
      color: var(--color-text-lighter);
    }

    dd {
      margin: 0;
      color: var(--color-text-light);
    }
  }

  &__steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    margin: 0;
    padding-left: var(--space-m);

    li {
      padding-left: var(--space-xxs);
    }
  }

  &__cmd {
    display: block;
    margin-top: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    background: var(--color-bg-lowered);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);
    font-size: var(--font-size-xs);
    color: var(--color-text);
    word-break: break-all;
  }
}
</style>
