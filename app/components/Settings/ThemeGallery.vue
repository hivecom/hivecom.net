<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Grid, Input, searchString, Tab, Tabs } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import ThemeCard from './ThemeCard.vue'

const emit = defineEmits<{
  create: []
  edit: [theme: Tables<'themes'>]
}>()

const userId = useUserId()

const { activeTheme, setActiveTheme } = useUserTheme()
const { themes, softDelete } = useDataThemes()

const activeTab = ref <'community' | 'official' | 'created'>('official')
const search = ref('')

const sortedThemes = computed(() => {
  const activeThemeId = activeTheme.value?.id

  // Filter out unmaintaned from stock/gallery but keep them in my created themes
  const categorized = (() => {
    switch (activeTab.value) {
      case 'community':
        return themes.value
          .filter(item => item.created_by !== null)
          .filter(item => !item.is_unmaintained || item.id === activeThemeId)
      case 'official':
        // Hivecom is the 02 user
        return themes.value
          .filter(item => item.created_by === null)
          .filter(item => !item.is_unmaintained || item.id === activeThemeId)
      case 'created':
        return themes.value.filter(item => item.created_by === userId.value)
    }
  })()

  return categorized
  // Hide unmaintained themes unless the current user still has it active

    // Search thems via name & description (NOTE: author would have been nice, but I only got the UUIDs)
    .filter(item => searchString([item.name, item.description], search.value))
    // Sorted active first, rest by date
    .toSorted((a, b) => {
      const aIsActive = a.id === activeTheme.value?.id
      const bIsActive = b.id === activeTheme.value?.id
      if (aIsActive !== bIsActive)
        return aIsActive ? -1 : 1
      if (a.is_unmaintained !== b.is_unmaintained)
        return a.is_unmaintained ? 1 : -1
      return a.created_at.localeCompare(b.created_at)
    })
})

function deprecateTheme(id: string) {
  if (activeTheme.value?.id === id) {
    setActiveTheme(null)
  }

  softDelete(id)
}

const isMobile = useBreakpoint('<s')
</script>

<template>
  <section>
    <Tabs v-model="activeTab" class="mb-m">
      <Tab value="official">
        Official
      </Tab>
      <Tab value="community">
        Community
      </Tab>
      <Tab v-if="userId" value="created">
        My themes
      </Tab>

      <template #end>
        <Button variant="accent" :square="isMobile" size="s" @click="emit('create')">
          <Icon v-if="isMobile" name="ph:plus" :size="16" />
          <template #start>
            <Icon v-if="!isMobile" name="ph:plus" :size="16" />
          </template>
          {{ isMobile ? '' : 'Create' }}
        </Button>
      </template>
    </Tabs>

    <Flex x-between y-center class="mb-s">
      <Input v-model="search" placeholder="Search themes..." class="search-input" />
    </Flex>

    <Grid column gap="l" expand :columns="isMobile ? 1 : 2">
      <!-- Fake theme card which resets theme to default. Shows up in stock or if it's active -->
      <ThemeCard
        v-if="activeTab === 'official'"
        :item="{
          id: '$$$$default',
          created_by: null,
          name: 'Default Theme',
          description: 'The default Hivecom theme',
        } as any"
        :active-theme-id="activeTheme ? '' : '$$$$default'"
        @apply="setActiveTheme(null)"
      />

      <ThemeCard
        v-for="item in sortedThemes"
        :key="item.id"
        :item="item"
        :active-theme-id="activeTheme?.id"
        @apply="setActiveTheme(item.id)"
        @edit="emit('edit', item)"
        @deprecate="deprecateTheme(item.id)"
      />
    </Grid>

    <template v-if="sortedThemes.length === 0">
      <Card v-if="activeTab === 'created'" class="card-bg">
        <Flex x-center y-center expand class="p-l">
          <Icon name="ph:paint-brush-bold" :size="24" />
          <strong>You've not created a theme yet!</strong>
        </Flex>
      </Card>

      <Card v-else-if="activeTab === 'community'" class="card-bg">
        <Flex x-center y-center expand class="p-l">
          <Icon name="ph:paint-brush-bold" :size="24" />
          <strong>No community themes available! Be the first to create one.</strong>
        </Flex>
      </Card>
    </template>
  </section>
</template>

<style scoped lang="scss">
.search-input {
  width: 100%;
  max-width: 328px;
}
</style>
