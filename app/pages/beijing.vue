<script setup lang="ts">
import type { ShortURL } from '@/lib/url-shortener'
import { required, url, useValidation } from '@dolanske/v-valid'
import { Accordion, Badge, Button, Card, CopyClipboard, Flex, pushToast, Tab, Tabs, Textarea, Tooltip } from '@dolanske/vui'
import { createShortURLLink, generateShortURLKey } from '@/lib/url-shortener'
import { normalizeErrors } from '@/lib/utils/formatting'

const client = useSupabaseClient()
const userId = useUserId()

const tab = ref<'tool' | 'links'>('tool')

const newUrl = ref<string | null>()
const form = reactive({ link: '' })
const loading = ref(false)

interface UserURLItem {
  key: string
  value: ShortURL
  created_at: string
}

const userUrls = ref<UserURLItem[]>([])

const sortedUserUrls = computed(() => userUrls.value.toSorted((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))

const { validate, errors } = useValidation(form, {
  link: [required, url],
}, {
  autoclear: true,
})

function handleSubmit() {
  loading.value = true

  validate()
    .then(async () => {
      const key = generateShortURLKey()

      const result = await client.from('kvstore')
        .insert({
          key,
          type: 'JSON',
          value: {
            link: form.link,
            created_by: userId.value,
            accessed: 0,
          },
        })
        .select()
        .single()

      if (result.error) {
        return pushToast('Error shortening link', {
          description: result.error.message,
        })
      }

      newUrl.value = createShortURLLink(key)
      userUrls.value.push(result.data)
    })
    .finally(() => {
      loading.value = false
    })
}

// List users URLS
onBeforeMount(async () => {
  const result = await client
    .from('kvstore')
    .select('*')
    .contains('value', { created_by: userId.value })

  if (result.error) {
    return console.error('Error fetching user URLs:', result.error)
  }

  userUrls.value = result.data as UserURLItem[]
})

// Reset state
function resetShortener() {
  form.link = ''
  newUrl.value = null
}

function revokeUrl(key: string) {
  client.from('kvstore')
    .delete()
    .eq('key', key)
    .then((result) => {
      if (result.error) {
        return pushToast('Error revoking URL', {
          description: result.error.message,
        })
      }

      userUrls.value = userUrls.value.filter(item => item.key !== key)
    })
}
</script>

<template>
  <div class="page container-s">
    <Card separators header-align="start">
      <template #header>
        <span class="text-s pt-s block text-color-accent">缩小它</span>
        <h2 class="mb-xs">
          URL Shortener
        </h2>
        <p class="text-color-light">
          Insert your long URL and receive a short Chinese URL
        </p>

        <div style="padding-bottom: 40px;" />

        <Tabs v-model="tab">
          <Tab value="tool">
            Shortener
          </Tab>
          <Tab value="links" :disabled="userUrls.length === 0">
            Your URLs
            <Badge size="s" circle>
              {{ userUrls.length }}
            </Badge>
          </Tab>
        </Tabs>
      </template>
      <template v-if="tab === 'tool'">
        <Accordion unstyled :open="!!!newUrl">
          <Flex v-if="tab === 'tool'" column gap="m" y-center style="padding:1px">
            <Textarea
              v-model="form.link"
              focus
              :errors="normalizeErrors(errors.link)"
              expand
              :rows="8"
              placeholder="Paste your link here..."
            />
            <Button expand :loading="loading" :variant="form.link.length === 0 ? 'gray' : 'accent'" :disabled="form.link.length === 0" @click="handleSubmit">
              Shorten URL
            </Button>
          </Flex>
        </Accordion>
        <Accordion unstyled :open="!!newUrl">
          <Card centered border-style="dashed" class="card-bg">
            <span class="block mb-xs text-color-lighter text-xs">Your shortened URL</span>
            <p class="mb-m block">
              <a :href="newUrl!" target="_blank" rel="noopener noreferrer" class="text-color-accent text-l">
                {{ newUrl }}
              </a>
            </p>
            <Flex gap="xs">
              <CopyClipboard :text="newUrl!" confirm="Copied!">
                <Button variant="fill">
                  <template #start>
                    <Icon name="ph:copy" />
                  </template>
                  Copy
                </Button>
              </CopyClipboard>
              <Button @click="resetShortener">
                New URL
              </Button>
            </Flex>
          </Card>
        </Accordion>
      </template>

      <template v-else>
        <Flex column>
          <div v-for="item in sortedUserUrls" :key="item.key" class="url-list-item">
            <div class="flex-1 pr-l">
              <Flex y-center gap="s">
                <a :href="createShortURLLink(item.key)" target="_blank" rel="noopener noreferrer">{{ item.key }}</a>
                <CopyClipboard :text="createShortURLLink(item.key)" confirm="Copied shortened URL">
                  <Button size="s" plain square>
                    <Icon name="ph:copy" />
                  </Button>
                </CopyClipboard>
              </Flex>
              <p>
                {{ item.value.link }}
              </p>
            </div>
            <Tooltip>
              <Badge variant="note">
                <Icon name="ph:arrow-square-out" />
                {{ item.value.accessed }}
              </Badge>
              <template #tooltip>
                <p style="max-width: 192px">
                  Number of times this URL has been accessed
                </p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button plain variant="danger" square size="s" @click="revokeUrl(item.key)">
                <Icon name="ph:trash" />
              </Button>
              <template #tooltip>
                <p style="max-width: 192px">
                  The shortened URL will be revoked & removed
                </p>
              </template>
            </Tooltip>
          </div>
        </Flex>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.container-s {
  max-width: 620px;
  padding-top: 15vh;
}

.vui-tabs {
  position: absolute;
  bottom: -1px;
  width: auto;
}

:deep(textarea) {
  height: 96px !important;
}

.url-list-item {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-xxs);
  background-color: var(--color-bg-medium);
  padding: var(--space-xs) var(--space-s);
  border-radius: var(--border-radius-m);

  a {
    color: var(--color-accent);
  }

  p {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-top: 2px;
    font-style: italic;
  }
}
</style>
