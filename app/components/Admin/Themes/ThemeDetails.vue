<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  theme: Tables<'themes'>
}>()

const emit = defineEmits<{
  delete: [theme: Tables<'themes'>]
}>()

const isOpen = defineModel<boolean>('isOpen')

const isMobile = useBreakpoint('<m')
const swatchColumns = computed(() => isMobile.value ? 4 : 6)

function handleClose() {
  isOpen.value = false
}

function handleDelete(theme: Tables<'themes'>) {
  emit('delete', theme)
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :key="props.theme?.id"
    :open="!!props.theme && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex y-center inline>
          <ThemeIcon :theme="props.theme" />
          <h4>{{ props.theme.name }}</h4>
        </Flex>
        <Flex y-center gap="xs">
          <Button square :href="`/themes/${props.theme.id}`" target="_blank">
            <Icon name="ph:arrow-square-out" />
          </Button>
          <AdminActions
            v-if="props.theme"
            resource-type="themes"
            :item="props.theme"
            :actions="['delete']"
            @delete="(item) => handleDelete(item as unknown as Tables<'themes'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.theme" column gap="m" class="theme-details">
      <!-- Basic info -->
      <DetailTable>
        <template #header>
          <Icon name="ph:paint-brush" />
          <h6>Overview</h6>
        </template>

        <DetailRow label="Description">
          <p class="text-s">
            {{ props.theme.description }}
          </p>
        </DetailRow>

        <DetailRow label="ID">
          <CopyValue :text="props.theme.id" link />
        </DetailRow>

        <DetailRow label="Created by">
          <UserLink v-if="props.theme.created_by" :user-id="props.theme.created_by" class="text-s" show-avatar />
          <span v-else class="text-color-lighter">Unknown</span>
        </DetailRow>

        <DetailRow label="Created">
          <TimestampDate :date="props.theme.created_at" size="s" class="text-color" />
        </DetailRow>

        <DetailRow v-if="props.theme.is_official || props.theme.is_unmaintained" label="Flags" wrap>
          <Badge v-if="props.theme.is_official" variant="accent" filled size="s">
            Official
          </Badge>
          <Badge v-else-if="props.theme.is_unmaintained" variant="warning" filled size="s">
            Unmaintained
          </Badge>
        </DetailRow>

        <DetailRow v-if="props.theme.forked_from" label="Forked from">
          <span class="text-s text-color-light">{{ props.theme.forked_from }}</span>
        </DetailRow>
      </DetailTable>

      <!-- Scale settings -->
      <Card separators class="card-bg">
        <template #header>
          <h6>Scale Settings</h6>
        </template>

        <DetailTable bare>
          <DetailRow label="Spacing">
            <span class="text-s">{{ props.theme.spacing }}%</span>
          </DetailRow>
          <DetailRow label="Rounding">
            <span class="text-s">{{ props.theme.rounding }}%</span>
          </DetailRow>
          <DetailRow label="Transitions">
            <span class="text-s">{{ props.theme.transitions }}%</span>
          </DetailRow>
          <DetailRow label="Widening">
            <span class="text-s">{{ props.theme.widening }}%</span>
          </DetailRow>
        </DetailTable>
      </Card>

      <!-- Color swatches -->
      <Card separators class="card-bg">
        <template #header>
          <h6>Dark Palette</h6>
        </template>

        <Grid :columns="swatchColumns" gap="s">
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_bg }" />
            <span class="text-xs text-color-light">BG</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_bg_medium }" />
            <span class="text-xs text-color-light">BG Medium</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_bg_raised }" />
            <span class="text-xs text-color-light">BG Raised</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_bg_lowered }" />
            <span class="text-xs text-color-light">BG Lowered</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_accent }" />
            <span class="text-xs text-color-light">Accent</span>
          </Flex>

          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_text }" />
            <span class="text-xs text-color-light">Text</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_border }" />
            <span class="text-xs text-color-light">Border</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_text_red }" />
            <span class="text-xs text-color-light">Red</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_text_green }" />
            <span class="text-xs text-color-light">Green</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_text_yellow }" />
            <span class="text-xs text-color-light">Yellow</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_text_blue }" />
            <span class="text-xs text-color-light">Blue</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.dark_text_purple }" />
            <span class="text-xs text-color-light">Purple</span>
          </Flex>
        </Grid>
      </Card>

      <Card separators class="card-bg">
        <template #header>
          <h6>Light Palette</h6>
        </template>

        <Grid :columns="swatchColumns" gap="s">
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_bg }" />
            <span class="text-xs text-color-light">BG</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_bg_medium }" />
            <span class="text-xs text-color-light">BG Medium</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_bg_raised }" />
            <span class="text-xs text-color-light">BG Raised</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_bg_lowered }" />
            <span class="text-xs text-color-light">BG Lowered</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_accent }" />
            <span class="text-xs text-color-light">Accent</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_text }" />
            <span class="text-xs text-color-light">Text</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_border }" />
            <span class="text-xs text-color-light">Border</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_text_red }" />
            <span class="text-xs text-color-light">Red</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_text_green }" />
            <span class="text-xs text-color-light">Green</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_text_yellow }" />
            <span class="text-xs text-color-light">Yellow</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_text_blue }" />
            <span class="text-xs text-color-light">Blue</span>
          </Flex>
          <Flex column x-center gap="xs">
            <div class="swatch" :style="{ background: props.theme.light_text_purple }" />
            <span class="text-xs text-color-light">Purple</span>
          </Flex>
        </Grid>
      </Card>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.theme-details {
  padding-bottom: var(--space);

  &__description {
    padding: var(--space-m);
  }
}

.swatch {
  width: 40px;
  height: 40px;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
}
</style>
