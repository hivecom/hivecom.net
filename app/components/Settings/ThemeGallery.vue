<script setup lang="ts">
import { Button, Card, Flex, Grid, Input, searchString, Tab, Tabs } from '@dolanske/vui'
import ThemeCard from './ThemeCard.vue'

const emit = defineEmits<{
  create: []
}>()

const userId = useUserId()

const { activeTheme, setActiveTheme } = useUserTheme()
const { themes } = useDataThemes()

const activeTab = ref<'gallery' | 'created'>('gallery')
const search = ref('')

const sortedThemes = computed(() =>
  themes.value
    // Filter based on view so we can omit changes in UI
    .filter(item => activeTab.value === 'gallery' ? true : item.created_by === userId.value)
    // Search thems via name & description (NOTE: author would have been nice, but I only got the UUIDs)
    .filter(item => searchString([item.name, item.description], search.value))
    // Sorted active first, rest by date
    .toSorted((a, b) => {
      const aIsActive = a.id === activeTheme.value?.id
      const bIsActive = b.id === activeTheme.value?.id
      if (aIsActive !== bIsActive)
        return aIsActive ? -1 : 1
      return a.created_at.localeCompare(b.created_at)
    }))
</script>

<template>
  <section>
    <Tabs v-model="activeTab" class="mb-m">
      <Tab value="gallery">
        Gallery
      </Tab>
      <Tab v-if="userId" value="created">
        Your themes
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
      <ThemeCard
        v-for="item in sortedThemes"
        :key="item.id"
        :item="item"
        :active-theme-id="activeTheme?.id"
        @apply="setActiveTheme"
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
