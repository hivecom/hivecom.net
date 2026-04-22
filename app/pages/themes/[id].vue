<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Alert, Badge, Button, Card, Divider, Flex, Tab, Tabs, theme } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import ThemeDetailColors from '@/components/Themes/ThemeDetailColors.vue'
import ThemeDetailCss from '@/components/Themes/ThemeDetailCss.vue'
import ThemeDetailTokens from '@/components/Themes/ThemeDetailTokens.vue'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import ThemeSampleUI from '@/components/Themes/ThemeSampleUI.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { DEFAULT_THEME, themeToScopedProperties } from '@/lib/theme'
import { formatTimeAgo } from '@/lib/utils/date'

const route = useRoute()
const router = useRouter()

function goBack() {
  const prev = window.history.state?.back as string | undefined
  if (prev && prev.startsWith('/themes'))
    router.back()
  else
    router.push('/themes')
}
const supabase = useSupabaseClient()
const { setActiveTheme, activeTheme } = useUserTheme()
const { seedEditor, editorActive } = useThemeEditorState()
const userId = useUserId()

type ThemeRow = Database['public']['Tables']['themes']['Row']
const data = ref<ThemeRow | null>(null)
const dataError = ref<string | null>(null)
const forks = ref<ThemeRow[]>([])
const userIds = ref<string[]>([])

const activeTab = ref<'preview' | 'colors' | 'tokens' | 'css'>('preview')

function openEditor() {
  seedEditor(data.value)
  editorActive.value = true
  router.push('/themes/sample')
}

const isDefaultTheme = computed(() => data.value?.id === '$default')
const isOwner = computed(() => !!userId.value && data.value?.created_by === userId.value)
const isThemeActive = computed(() => isDefaultTheme.value || activeTheme.value?.id === data.value?.id)

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

const isMobile = useBreakpoint('<s')
</script>

<template>
  <div class="page">
    <div class="container-m">
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
              @click="goBack"
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
            <Flex y-start :gap="isMobile ? 's' : 'l'" :column="isMobile">
              <ThemeIcon :theme="data" :size="isMobile ? 'm' : 'xl'" />
              <div>
                <h1>
                  {{ data.name }}
                  <TinyBadge v-if="data.id === activeTheme?.id || route.params.id === '$default'" variant="accent" style="vertical-align: middle;">
                    Active
                  </TinyBadge>
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
            <Button v-else-if="userId" size="s" :square="isMobile" @click="openEditor">
              <template v-if="isMobile">
                <Icon name="ph:git-fork" />
              </template>
              <template #start>
                <Icon v-if="!isMobile" name="ph:git-fork" />
              </template>
              {{ isMobile ? '' : 'Fork' }}
            </Button>
            <Button
              size="s"
              :variant="isThemeActive ? 'gray' : 'accent'"
              @click="setActiveTheme(isThemeActive ? null : data.id)"
            >
              <template #start>
                <Icon :name="isThemeActive ? 'ph:paint-brush' : 'ph:paint-brush-fill'" :size="16" />
              </template>
              {{ isThemeActive ? 'Remove' : 'Apply' }}
            </Button>
          </Flex>
        </section>

        <Divider :size="40" />

        <section class="theme-details">
          <Flex column gap="xl">
            <Card :class="{ 'card-bg': activeTab !== 'preview' }" separators>
              <template #header>
                <Tabs v-model="activeTab" variant="filled" :style="{ width: isMobile ? '100%' : 'fit-content' }" :expand="isMobile">
                  <Tab value="preview">
                    Preview
                  </Tab>
                  <Tab value="colors">
                    Colors
                  </Tab>
                  <Tab value="tokens">
                    Tokens
                  </Tab>
                  <Tab value="css">
                    CSS
                  </Tab>
                </Tabs>
              </template>

              <!-- Colors tab -->
              <ThemeDetailColors v-show="activeTab === 'colors'" :data="data" />

              <!-- Tokens tab -->
              <ThemeDetailTokens v-show="activeTab === 'tokens'" :data="data" />

              <!-- CSS tab -->
              <ThemeDetailCss v-show="activeTab === 'css'" :data="data" />

              <!-- Preview UI -->
              <div
                v-show="activeTab === 'preview'"
                class="preview-panel"
                :style="{ ...themeToScopedProperties(data, theme === 'light' ? 'light' : 'dark'),
                          backgroundColor: 'var(--color-bg)' }"
              >
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
              <Flex v-if="userId" x-between y-center expand class="theme-details__meta-item">
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

              <Flex v-if="data.custom_css" gap="xs" class="theme-details__meta-item">
                <Badge v-if="data.custom_css" variant="warning">
                  CSS
                </Badge>
                <Badge v-if="data.custom_css && data.custom_css.includes('url')" variant="danger">
                  Uses CSS URL
                </Badge>
              </Flex>
            </Flex>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.preview-panel {
  // Pull the panel out of the card's body padding so it fills edge-to-edge,
  // then re-apply padding inside so content still has breathing room.
  margin: calc(-1 * var(--space-m));
  padding: var(--space-m);
}

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

@media screen and (max-width: $breakpoint-s) {
  .theme-details {
    display: flex;
    gap: var(--space-l);
    flex-direction: column-reverse;
    // grid-template-columns: 1fr;
  }
}
</style>
