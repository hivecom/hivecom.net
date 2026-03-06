<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Card, Divider, Flex, pushToast, Switch } from '@dolanske/vui'
import { isNil } from '@/lib/utils/common'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const settingsError = ref(false)

const settings = reactive<Tables<'settings'>['data']>({
  show_nsfw_warning: true,
  show_nsfw_content: true,
  editor_floating: false,
})

// Fetch settings on load
onBeforeMount(async () => {
  if (user.value) {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .maybeSingle()

    if (error) {
      return settingsError.value = true
    }

    if (data) {
      // Assign fetched values into settings only if they are defined
      if (!isNil(data.data.show_nsfw_content))
        settings.show_nsfw_content = data.data.show_nsfw_content
      if (!isNil(data.data.show_nsfw_warning))
        settings.show_nsfw_warning = data.data.show_nsfw_warning
      if (!isNil(data.data.editor_floating))
        settings.editor_floating = data.data.editor_floating
    }
  }
})

// Immedaitely update settings on change
watch(settings, async (newSettings) => {
  if (!user.value)
    return

  const { error } = await supabase
    .from('settings')
    .upsert({ id: user.value.id, data: newSettings })

  if (error) {
    pushToast('Failed to save settings', { description: error.message })
  }
}, { deep: true })
</script>

<template>
  <Card v-if="!settingsError" class="card-bg" separators>
    <template #header>
      <h4>General</h4>
    </template>

    <Switch disabled class="reversed" label="User high contrast theme" />

    <Divider :size="40" />

    <!-- <strong class="block mb-m text-m text-semibold text-color-light">Discussions</strong> -->
    <Flex gap="xs" column>
      <Switch v-model="settings.show_nsfw_content" class="reversed" label="Show NSFW content" />
      <Switch v-model="settings.show_nsfw_warning" class="reversed" label="Show NSFW content warnings" />
      <p class="text-color-lightest text-s">
        These settings apply to all discussions on the website. Including forum and comment sections
      </p>
    </Flex>

    <Divider :size="40" />

    <!-- <strong class="block mb-m text-m text-semibold text-color-light">Text editor</strong> -->
    <Flex gap="xs" column>
      <Switch v-model="settings.editor_floating" class="reversed" label="Floating editor" />
      <p class="text-color-lightest text-s">
        If enabled, the text editor will float at the bottom of the screen when viewing forum posts.
      </p>
    </Flex>
  </Card>
</template>
