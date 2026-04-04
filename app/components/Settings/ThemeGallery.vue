<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Grid, Input, searchString, Tab, Tabs } from '@dolanske/vui'
import ThemeCard from './ThemeCard.vue'

const emit = defineEmits<{
  create: []
  edit: [theme: Tables<'themes'>]
}>()

const userId = useUserId()

const { activeTheme, setActiveTheme } = useUserTheme()
const { themes } = useDataThemes()

const activeTab = ref <'gallery' | 'stock' | 'created'>('gallery')
const search = ref('')

const sortedThemes = computed(() => {
  const activeThemeId = activeTheme.value?.id

  const categorized = (() => {
    switch (activeTab.value) {
      case 'gallery':
        return themes.value.filter(item => item.created_by !== null)
      case 'stock':
        // Hivecom is the 02 user
        return themes.value.filter(item => item.created_by === null)
      case 'created':
        return themes.value.filter(item => item.created_by === userId.value)
    }
  })()

  return categorized
    // Hide unmaintained themes unless the current user still has it active
    .filter(item => !item.is_unmaintained || item.id === activeThemeId)
    // Search thems via name & description (NOTE: author would have been nice, but I only got the UUIDs)
    .filter(item => searchString([item.name, item.description], search.value))
    // Sorted active first, rest by date
    .toSorted((a, b) => {
      const aIsActive = a.id === activeTheme.value?.id
      const bIsActive = b.id === activeTheme.value?.id
      if (aIsActive !== bIsActive)
        return aIsActive ? -1 : 1
      return a.created_at.localeCompare(b.created_at)
    })
})

function deleteTheme(id: string) {
  if (activeTheme.value?.id === id) {
    setActiveTheme(null)
  }
}
</script>

<template>
  <section>
    <Tabs v-model="activeTab" class="mb-m">
      <Tab value="gallery">
        Gallery
      </Tab>
      <Tab value="stock">
        Stock
      </Tab>
      <Tab v-if="userId" value="created">
        My themes
      </Tab>
    </Tabs>

    <Flex x-between y-center class="mb-s">
      <Input v-model="search" placeholder="Search themes..." class="search-input" />

      <Button variant="accent" @click="emit('create')">
        <template #start>
          <Icon name="ph:plus" :size="16" />
        </template>
        Create theme
      </Button>
    </Flex>

    <Grid column gap="l" expand :columns="2">
      <!-- Fake theme card which resets theme to default. Shows up in stock or if it's active -->
      <ThemeCard
        v-if="activeTab === 'stock'"
        :item="{
          id: '$$$$default',
          created_by: null,
          name: 'Default theme',
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
        @delete="deleteTheme(item.id)"
      />
    </Grid>

    <Card v-if="activeTab === 'created' && sortedThemes.length === 0">
      <Flex x-center y-center expand class="p-l">
        <Icon name="ph:paint-brush-bold" :size="24" />
        <strong>You've not created a theme yet!</strong>
      </Flex>
    </Card>
  </section>
</template>

<style scoped lang="scss">
.search-input {
  width: 100%;
  max-width: 328px;
}
</style>
