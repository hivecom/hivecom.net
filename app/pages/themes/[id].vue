<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, Card, Divider, Flex, Tab, Tabs, theme } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import ThemeDetailColors from '@/components/Themes/ThemeDetailColors.vue'
import ThemeDetailCss from '@/components/Themes/ThemeDetailCss.vue'
import ThemeDetailTokens from '@/components/Themes/ThemeDetailTokens.vue'
import ThemeEditor from '@/components/Themes/ThemeEditor.vue'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import ThemeSampleUI from '@/components/Themes/ThemeSampleUI.vue'
import { DEFAULT_THEME, themeToScopedProperties } from '@/lib/theme'
import { formatTimeAgo } from '@/lib/utils/date'

const route = useRoute()
const supabase = useSupabaseClient()
const { setActiveTheme } = useUserTheme()
const { seedEditor } = useThemeEditorState()
const userId = useUserId()

const data = ref<Tables<'themes'> | null>(null)
const dataError = ref<string | null>(null)
const forks = ref<Tables<'themes'>[]>([])
const userIds = ref<string[]>([])

const activeTab = ref<'colors' | 'tokens' | 'css' | 'sample'>('colors')
const editorOpen = ref(false)

function openEditor() {
  seedEditor(data.value)
  editorOpen.value = true
}

const isDefaultTheme = computed(() => data.value?.id === '$default')
const isOwner = computed(() => !!userId.value && data.value?.created_by === userId.value)

onBeforeMount(() => {
  if (route.params.id === '$default') {
    data.value = DEFAULT_THEME
    return
  }

  if (route.params.id) {
    // Fetch all theme data
    supabase
      .from('themes')
      .select('*')
      .eq('id', route.params.id)
      .single()
      .then(({ data: themeData, error }) => {
        if (error) {
          dataError.value = error.message
          return
        }

        data.value = themeData
      })

    // Fetch user id's using this theme
    supabase
      .from('profiles')
      .select('id')
      .eq('theme_id', route.params.id)
      .then(({ data: profilesData, error }) => {
        if (error) {
          console.error('Error fetching profiles for theme detail:', error)
          return
        }

        userIds.value = profilesData?.map(profile => profile.id) ?? []
      })

    // Fetch how many forks are based on this theme
    supabase
      .from('themes')
      .select('id')
      .eq('forked_from', route.params.id)
      .then(({ data: forksData, error }) => {
        if (error) {
          console.error('Error fetching forks for theme detail:', error)
          return
        }

        forks.value = forksData ?? []
      })
  }
})
</script>

<template>
  <div class="page">
    <div class="container container-m">
      <template v-if="dataError">
        <Alert variant="danger">
          {{ dataError }}
        </Alert>
      </template>
      <template v-else-if="data">
        <section>
          <Flex x-between>
            <Button
              variant="gray"
              plain
              size="s"
              aria-label="Go back to Events page"
              class="event-detail__back-link"
              @click="$router.back()"
            >
              <template #start>
                <Icon name="ph:arrow-left" />
              </template>
              Back to Themes
            </Button>
          </Flex>

          <Alert v-if="data.is_unmaintained" variant="info" class="mt-m" filled>
            This theme is no longer maintained. You can still use it or fork it to make your own version.
          </Alert>

          <div class="page-title">
            <Flex y-start gap="l">
              <ThemeIcon :theme="data" size="l" />
              <div>
                <h1>
                  {{ data.name }}
                </h1>
                <p v-if="data.description">
                  {{ data.description }}
                </p>
              </div>
            </Flex>
          </div>
          <Flex y-end x-start gap="xs">
            <UserDisplay v-if="data.created_by || data.is_official" :user-id="data.created_by" show-role size="s" />
            <div class="flex-1" />
            <Button v-if="isOwner" square size="s" @click="openEditor">
              <Icon name="ph:pencil-simple" />
            </Button>
            <Button v-else-if="userId" size="s" @click="openEditor">
              <template #start>
                <Icon name="ph:git-fork" />
              </template>
              Fork
            </Button>
            <Button size="s" variant="accent" @click="setActiveTheme(isDefaultTheme ? null : data.id)">
              <template #start>
                <Icon name="ph:paint-brush-fill" :size="16" />
              </template>
              Apply
            </Button>
          </Flex>
        </section>

        <Divider :size="40" />

        <section class="theme-details">
          <Flex column gap="xl">
            <Card :class="{ 'card-bg': activeTab !== 'sample' }" separators>
              <template #header>
                <Tabs v-model="activeTab" variant="filled" style="width:fit-content">
                  <Tab value="colors">
                    Colors
                  </Tab>
                  <Tab value="tokens">
                    Tokens
                  </Tab>
                  <Tab value="css">
                    CSS
                  </Tab>
                  <Tab value="sample">
                    Sample
                  </Tab>
                </Tabs>
              </template>

              <!-- Colors tab -->
              <ThemeDetailColors v-show="activeTab === 'colors'" :data="data" />

              <!-- Tokens tab -->
              <ThemeDetailTokens v-show="activeTab === 'tokens'" :data="data" />

              <!-- CSS tab -->
              <ThemeDetailCss v-show="activeTab === 'css'" :data="data" />

              <!-- Sample UI -->
              <div v-show="activeTab === 'sample'" :style="themeToScopedProperties(data, theme === 'light' ? 'light' : 'dark')">
                <ThemeSampleUI compact />
              </div>
            </Card>

            <Flex v-if="!isDefaultTheme" column gap="s" expand>
              <h4>
                Comments
              </h4>
              <Discussion
                :id="String(data.id)"
                type="theme"
              />
            </Flex>
          </Flex>
          <div class="relative">
            <Flex column gap="m" class="theme-details__meta">
              <Flex x-between y-center expand class="theme-details__meta-item">
                <span>Published</span>
                <TimestampDate :date="data.created_at">
                  <span>{{ formatTimeAgo(data.created_at) }}</span>
                </TimestampDate>
              </Flex>
              <Flex v-if="data.modified_at" x-between y-center expand class="theme-details__meta-item">
                <span>Updated</span>
                <span>{{ formatTimeAgo(data.modified_at) }}</span>
              </Flex>
              <Flex x-between y-center expand class="theme-details__meta-item">
                <span>Users</span>
                <BulkAvatarDisplay
                  no-empty-state
                  :user-ids="userIds"
                  :max-users="3"
                  :avatar-size="24"
                  :random="true"
                  :gap="4"
                  :expand="false"
                />
                <span v-if="userIds.length === 0">None</span>
              </Flex>

              <Flex x-between y-center expand class="theme-details__meta-item">
                <span>Forks</span>

                <BadgeCircle v-if="forks.length > 0">
                  {{ forks.length }}
                </BadgeCircle>
                <span v-else>None</span>
              </Flex>

              <Flex gap="xs" class="theme-details__meta-item">
                <Badge v-if="data.custom_css" variant="warning">
                  CSS
                </Badge>
                <Badge v-if="data.custom_css && data.custom_css.includes('url')" variant="danger">
                  Uses CSS url
                </Badge>
              </Flex>
            </Flex>
          </div>
        </section>
      </template>
    </div>

    <ThemeEditor
      v-if="data && editorOpen"
      open
      @close="editorOpen = false"
      @saved="editorOpen = false"
    />
  </div>
</template>

<style lang="scss" scoped>
.theme-details {
  display: grid;
  grid-template-columns: 1fr 212px;
  gap: var(--space-xl);

  &__meta {
    position: sticky;
    top: 80px;
  }

  &__meta-item {
    min-height: 24px;

    span {
      font-size: var(--font-size-s);
    }

    & > span {
      color: var(--color-text-light);
    }
  }
}
</style>
