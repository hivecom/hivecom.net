<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  theme: Tables<'themes'> | null
}>()

const emit = defineEmits(['delete'])

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
        <Flex column :gap="0">
          <h4>Theme Details</h4>
          <p v-if="props.theme" class="text-color-light text-xs">
            <NuxtLink :to="`/themes/${props.theme.id}`" target="_blank">
              {{ props.theme.name }}
            </NuxtLink>
          </p>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.theme"
            resource-type="themes"
            :item="props.theme as unknown as Record<string, unknown>"
            :show-labels="true"
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

        <DetailRow label="Flags" wrap>
          <Badge v-if="props.theme.is_official" variant="accent" filled size="s">
            Official
          </Badge>
          <Badge v-if="props.theme.is_unmaintained" variant="warning" filled size="s">
            Unmaintained
          </Badge>
          <span v-if="!props.theme.is_official && !props.theme.is_unmaintained" class="text-s text-color-lighter">
            None
          </span>
        </DetailRow>

        <DetailRow label="Forked from">
          <span v-if="props.theme.forked_from" class="text-s text-color-light">{{ props.theme.forked_from }}</span>
          <span v-else class="text-color-lighter text-s">Original</span>
        </DetailRow>
      </DetailTable>

      <!-- Description -->
      <DetailTable v-if="props.theme.description">
        <template #header>
          <Icon name="ph:text-align-left" />
          <h6>Description</h6>
        </template>
        <div class="theme-details__description">
          <p class="text-s">
            {{ props.theme.description }}
          </p>
        </div>
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

      <!-- Color swatches - dark palette -->
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
        </Grid>
      </Card>

      <!-- Color swatches - light palette -->
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
        </Grid>
      </Card>

      <!-- Metadata -->
      <Metadata
        :created-at="props.theme.created_at"
        :created-by="props.theme.created_by ?? null"
        :modified-at="props.theme.modified_at ?? null"
        :modified-by="props.theme.modified_by ?? null"
      />
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
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
}
</style>
