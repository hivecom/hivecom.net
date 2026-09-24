<script setup lang="ts">
import type { GameDetailsFormState, GameDetailsValidation } from '@/lib/games/details'
import { Flex, Input } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import ColorPicker from '@/components/Shared/ColorPicker.vue'
import TagInput from '@/components/Shared/TagInput.vue'
import { GAME_DESCRIPTION_MAX } from '@/lib/games/details'

const props = defineProps<{
  modelValue: GameDetailsFormState
  validation: GameDetailsValidation
}>()

const emit = defineEmits<{
  'update:modelValue': [value: GameDetailsFormState]
}>()

const RichTextEditor = defineAsyncComponent(() => import('@/components/Editor/RichTextEditor.vue'))

function update<K extends keyof GameDetailsFormState>(key: K, value: GameDetailsFormState[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <Flex column gap="m" expand>
    <Input
      :model-value="modelValue.website"
      expand
      name="website"
      label="Website"
      type="url"
      placeholder="https://example.com (optional)"
      @update:model-value="update('website', String($event))"
    />

    <Input
      :model-value="modelValue.connect_uri"
      expand
      name="connect_uri"
      label="Connect URI"
      placeholder="steam://connect/{address}:{port} (optional)"
      hint="Launch template. Tokens: {address} {port} {steam_id} {command}. Leave empty for copy-only servers."
      :error="validation.connect_uri ? undefined : 'Must start with steam://, minecraft://, ts3server:// or https://'"
      @update:model-value="update('connect_uri', String($event))"
    />

    <Input
      :model-value="modelValue.connect_command"
      expand
      name="connect_command"
      label="Connect Command"
      placeholder="+connect {address}:{port} (optional)"
      hint="Console or launch arguments players can copy. Tokens: {address} {port}."
      @update:model-value="update('connect_command', String($event))"
    />

    <Flex column gap="xxs" expand>
      <Input
        :model-value="modelValue.description"
        expand
        name="description"
        label="Tagline"
        placeholder="A short one-liner about the game"
        :maxlength="GAME_DESCRIPTION_MAX"
        @update:model-value="update('description', String($event))"
      />
      <span class="text-xs text-color-lighter" :class="{ 'text-color-red': modelValue.description.length >= GAME_DESCRIPTION_MAX }">
        {{ modelValue.description.length }} / {{ GAME_DESCRIPTION_MAX }}
      </span>
    </Flex>

    <RichTextEditor
      :model-value="modelValue.markdown"
      label="Content"
      hint="You can use markdown and add media by drag-and-drop"
      placeholder="Write a longer description of the game..."
      min-height="180px"
      show-expand-button
      always-show-expand-button
      @update:model-value="update('markdown', $event ?? '')"
    />

    <TagInput
      :model-value="modelValue.genre_tags"
      label="Genre Tags"
      placeholder="e.g. FPS, Survival, Co-op"
      @update:model-value="update('genre_tags', $event)"
    />

    <ColorPicker
      :model-value="modelValue.color"
      label="Accent Color"
      stacked
      clearable
      :error="validation.color ? undefined : 'Must be a valid hex color (e.g. #ff0000)'"
      @update:model-value="update('color', $event)"
    />
  </Flex>
</template>
