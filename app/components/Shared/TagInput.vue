<script setup lang="ts">
import { Badge, Button, Flex, Input } from '@dolanske/vui'
import { ref } from 'vue'
import { sanitizeTags } from '@/lib/utils/sanitize'

const props = defineProps<{
  label?: string
  placeholder?: string
  /** Allow comma-separated bulk entry */
  allowBulk?: boolean
}>()

const tags = defineModel<string[]>({ default: () => [] })

const inputValue = ref('')

function addTags() {
  const raw = inputValue.value
  if (!raw.trim())
    return
  const newTags = sanitizeTags(raw, tags.value)
  if (newTags.length)
    tags.value = [...tags.value, ...newTags]
  inputValue.value = ''
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}
</script>

<template>
  <Flex column gap="xs" expand>
    <label v-if="props.label" class="tag-input__label">{{ props.label }}</label>
    <Flex gap="xs" y-center>
      <Input
        v-model="inputValue"
        expand
        :placeholder="props.placeholder ?? 'Add tag...'"
        @keydown.enter.prevent="addTags"
      />
      <Button variant="accent" square :disabled="!inputValue.trim()" @click="addTags">
        <Icon name="ph:plus" />
      </Button>
    </Flex>
    <Flex v-if="tags.length > 0" gap="xs" wrap class="tag-input__tags">
      <Badge
        v-for="tag in tags"
        :key="tag"
        size="s"
        variant="neutral"
        class="tag-input__badge"
      >
        {{ tag }}
        <Button size="s" square class="tag-input__remove" @click="removeTag(tag)">
          <Icon name="ph:x" />
        </Button>
      </Badge>
    </Flex>
  </Flex>
</template>

<style scoped lang="scss">
.tag-input__label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.tag-input__tags {
  margin-top: var(--space-xxs);
}

.tag-input__badge {
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
}

.tag-input__remove {
  padding: 2px;
  min-width: auto;
  min-height: auto;
  width: 16px;
  height: 16px;
  border-radius: var(--border-radius-pill);
  background: rgba(0, 0, 0, 0.2);
  color: currentColor;

  &:hover {
    background: rgba(0, 0, 0, 0.4);
  }

  svg {
    font-size: 10px;
  }
}
</style>
