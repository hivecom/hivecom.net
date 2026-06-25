<script setup lang="ts">
import type { DepotApiKey } from '@/composables/useDepot'
import { Alert, Badge, Button, CopyClipboard, Divider, Flex, Input, Modal, pushToast, Tooltip } from '@dolanske/vui'
import { onMounted, ref } from 'vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import { useDepot } from '@/composables/useDepot'

// API keys for Orbit Depot, the storage gateway. A key lets CLI / ShareX
// clients upload as this user. Minting and revoking both require the Supabase
// JWT (an API key can't manage keys), so this lives behind the signed-in page.
const depot = useDepot()
const depotUrl = depot.baseUrl
const depotHost = depot.host

const showInfo = ref(false)

// Rendered in the "how to use" modal. Plain markdown, depot URL baked in.
const SHARING_HELP_MD = `
[${depotHost}](${depotUrl}) is Hivecom's media storage gateway: you upload a file and it hands back a public link. It's part of [Orbit](https://github.com/hivecom/orbit-spec), our set of self-hosted services, and the code is open source at [hivecom/orbit-depot](https://github.com/hivecom/orbit-depot).

Anything you upload via the Hivecom chat uses Orbit's Depot as a destination. If you want programmatic access, this is where you get it.

API keys let CLI and ShareX clients upload to ${depotHost} as you. A key acts as your account, so treat it like a password and revoke any you stop using.

**Using API Keys**

Give it a label so you remember where it lives (like "Laptop ShareX"), then press Mint key. The secret is shown once, copy it right away. You can revoke it any time from the list.

**Upload with curl**
\`\`\`bash
curl -H "Authorization: Bearer depot_your_key" \\
  -F "file=@image.png" \\
  ${depotUrl}/upload
\`\`\`
The response has a \`url\` field with the public link.

**ShareX custom uploader**

- Destination: Image uploader, Method \`POST\`
- Request URL: \`${depotUrl}/upload\`
- Body: Form data (multipart), file form name \`file\`
- Headers: \`Authorization\` = \`Bearer depot_your_key\`
- URL response parsing: \`{json:url}\`

**Limits**

Files cap at 100MB. Uploads are rate limited (10 per minute on the one-shot path), so a tight loop will return 429.
`

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function formatDate(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : '-'
}

// --- Mint ---
const keyLabel = ref('')
const minting = ref(false)
const mintedKey = ref<string | null>(null)

async function mintKey() {
  if (minting.value)
    return
  if (!keyLabel.value.trim()) {
    pushToast('Label required', { description: 'Give the key a label first.' })
    return
  }

  minting.value = true
  try {
    const created = await depot.mintKey(keyLabel.value.trim())
    // The raw key is only returned once, on creation.
    mintedKey.value = created.key
    keyLabel.value = ''
    pushToast('API key minted')
    loadKeys()
  }
  catch (error) {
    pushToast('Mint failed', { description: errorMessage(error) })
  }
  finally {
    minting.value = false
  }
}

// --- List / revoke ---
const keys = ref<DepotApiKey[]>([])
const loadingKeys = ref(false)
const revokingId = ref<string | null>(null)

async function loadKeys() {
  loadingKeys.value = true
  try {
    keys.value = await depot.listKeys()
  }
  catch (error) {
    pushToast('Could not load keys', { description: errorMessage(error) })
  }
  finally {
    loadingKeys.value = false
  }
}

async function revokeKey(id: string) {
  if (revokingId.value)
    return

  revokingId.value = id
  try {
    await depot.revokeKey(id)
    keys.value = keys.value.filter(k => k.id !== id)
    pushToast('Key revoked')
  }
  catch (error) {
    pushToast('Revoke failed', { description: errorMessage(error) })
  }
  finally {
    revokingId.value = null
  }
}

onMounted(loadKeys)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex x-between y-start gap="m" expand>
      <p class="text-s text-color-lighter">
        API keys let CLIs and ShareX clients upload to <a :href="depotUrl" target="_blank">{{ depotHost }}</a> as you. <b>A key acts as your account, so treat it like a password.</b>
      </p>
      <Tooltip>
        <Button size="s" square plain @click="showInfo = true">
          <Icon name="ph:info" size="18" />
        </Button>
        <template #tooltip>
          How to use
        </template>
      </Tooltip>
    </Flex>

    <Flex column gap="s" expand>
      <Flex gap="xs" y-center expand>
        <Input
          v-model="keyLabel"
          placeholder="Label (e.g. ShareX / Local CLI / Laptop Macro)"
          expand
          @keydown.enter="mintKey"
        />
        <Button variant="accent" :disabled="!keyLabel" :loading="minting" @click="mintKey">
          Mint key
        </Button>
      </Flex>

      <template v-if="mintedKey">
        <Alert variant="info">
          <p class="text-xs">
            Copy this now - it won't be shown again.
          </p>
        </Alert>
        <Flex gap="xs" y-center expand>
          <code class="key w-100">{{ mintedKey }}</code>
          <CopyClipboard :text="mintedKey" confirm="Copied!">
            <Button variant="gray">
              Copy
            </Button>
          </CopyClipboard>
        </Flex>
      </template>
    </Flex>

    <Divider />

    <Flex column gap="s" expand>
      <Flex x-between y-center gap="s" wrap expand>
        <strong class="text-color-light">Your keys</strong>
        <Button size="s" plain square :loading="loadingKeys" @click="loadKeys">
          <Icon name="ph:arrow-counter-clockwise" />
        </Button>
      </Flex>

      <Flex v-if="!loadingKeys && keys.length === 0" expand>
        <p class="text-s text-color-lighter">
          No keys yet. Go make one and upload something.
        </p>
      </Flex>
      <Flex v-for="(key, index) in keys" v-else :key="key.id" column class="w-100">
        <Divider v-if="index > 0" />
        <Flex x-between y-center gap="m" expand>
          <Flex column gap="xxs">
            <Flex y-center gap="xs" wrap>
              <strong>{{ key.label }}</strong>
              <Badge v-for="scope in key.scopes" :key="scope" size="s">
                {{ scope }}
              </Badge>
            </Flex>
            <span class="text-color-lighter text-xs">
              Created {{ formatDate(key.created_at) }}, last used {{ formatDate(key.last_used_at) }}
            </span>
          </Flex>
          <Tooltip>
            <Button
              size="s"
              square
              plain
              variant="danger"
              :loading="revokingId === key.id"
              :disabled="revokingId !== null"
              @click="revokeKey(key.id)"
            >
              <Icon name="ph:trash" size="16" />
            </Button>
            <template #tooltip>
              Revoke key
            </template>
          </Tooltip>
        </Flex>
      </Flex>
    </Flex>
  </Flex>

  <Modal :open="showInfo" size="l" centered scrollable :card="{ separators: true }" @close="showInfo = false">
    <template #header>
      <h4>Sharing</h4>
    </template>

    <MarkdownRenderer :md="SHARING_HELP_MD" skeleton-height="360px" />

    <template #footer="{ close }">
      <Flex x-end>
        <Button @click="close">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.key {
  padding: var(--space-xs) var(--space-s);
  background: var(--color-bg-lowered);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  word-break: break-all;
}
</style>
