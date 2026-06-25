<script setup lang="ts">
import { Alert } from '@dolanske/vui'
import { computed, onBeforeMount, ref, watch } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'
import KPIContainer from '@/components/Admin/KPIContainer.vue'
import { useDepot } from '@/composables/useDepot'
import { formatBytes } from '@/lib/storageAssets'

// Total uploads is owned by the file table (it already pages the list), so the
// page threads it down here. Storage usage is fetched straight from the gateway.
const props = defineProps<{
  total: number
}>()

// Bumped by the file table after an upload or delete so usage refetches.
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { getQuota } = useDepot()

const loading = ref(true)
const errorMessage = ref('')
const quota = ref({ used: 0, limit: 0, unlimited: true })

// "X / Y" when capped, otherwise just the used figure.
const storageValue = computed(() =>
  quota.value.unlimited
    ? formatBytes(quota.value.used)
    : `${formatBytes(quota.value.used)} / ${formatBytes(quota.value.limit)}`,
)

const storageDescription = computed(() =>
  quota.value.unlimited
    ? 'You have no storage cap.'
    : 'Your total upload size counts against this cap. Delete uploads to free space.',
)

async function fetchQuota() {
  loading.value = true
  errorMessage.value = ''
  try {
    quota.value = await getQuota()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load storage usage'
  }
  finally {
    loading.value = false
  }
}

watch(() => refreshSignal.value, fetchQuota)
onBeforeMount(fetchQuota)
</script>

<template>
  <KPIContainer class="sharing-quota">
    <KPICard
      label="Your Uploads"
      :value="props.total"
      icon="ph:folders"
      variant="primary"
      description="Files you've uploaded to the gateway"
    />
    <KPICard
      label="Storage Used"
      :value="storageValue"
      icon="ph:database"
      variant="success"
      :is-loading="loading"
      :description="storageDescription"
    />
  </KPIContainer>

  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>
</template>

<style scoped lang="scss">
.sharing-quota {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-m);
  align-items: stretch;
}

.sharing-quota :deep(> .kpi-card) {
  width: 100%;
  height: 100%;
}
</style>
