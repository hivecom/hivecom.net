<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
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
            {{ props.theme.name }}
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
      <Card class="card-bg">
        <Flex column gap="l" expand>
          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">ID:</span>
            <span class="text-xs text-color-light">{{ props.theme.id }}</span>
          </Grid>

          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Name:</span>
            <span>{{ props.theme.name }}</span>
          </Grid>

          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Description:</span>
            <span v-if="props.theme.description">{{ props.theme.description }}</span>
            <span v-else class="text-color-lighter">No description</span>
          </Grid>

          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Created by:</span>
            <UserLink v-if="props.theme.created_by" :user-id="props.theme.created_by" />
            <span v-else class="text-color-lighter">Unknown</span>
          </Grid>

          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Created:</span>
            <TimestampDate :date="props.theme.created_at" size="s" class="text-color" />
          </Grid>

          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Flags:</span>
            <Flex gap="xs" wrap>
              <TinyBadge v-if="props.theme.is_official" variant="accent" filled size="xs">
                Official
              </TinyBadge>
              <TinyBadge v-if="props.theme.is_unmaintained" variant="warning" filled size="xs">
                Unmaintained
              </TinyBadge>
              <span v-if="!props.theme.is_official && !props.theme.is_unmaintained" class="text-color-lighter">
                None
              </span>
            </Flex>
          </Grid>

          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Forked from:</span>
            <span v-if="props.theme.forked_from" class="text-xs text-color-light">{{ props.theme.forked_from }}</span>
            <span v-else class="text-color-lighter">Original</span>
          </Grid>
        </Flex>
      </Card>

      <!-- Scale settings -->
      <Card separators class="card-bg">
        <template #header>
          <h6>Scale Settings</h6>
        </template>

        <Flex column gap="m" expand>
          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Spacing:</span>
            <span>{{ props.theme.spacing }}%</span>
          </Grid>
          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Rounding:</span>
            <span>{{ props.theme.rounding }}%</span>
          </Grid>
          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Transitions:</span>
            <span>{{ props.theme.transitions }}%</span>
          </Grid>
          <Grid class="theme-details__item" expand :columns="2">
            <span class="text-color-light text-bold">Widening:</span>
            <span>{{ props.theme.widening }}%</span>
          </Grid>
        </Flex>
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

  &__item {
    align-items: start;
  }
}

.swatch {
  width: 40px;
  height: 40px;
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
}
</style>
