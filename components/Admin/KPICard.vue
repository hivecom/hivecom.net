<script setup lang="ts">
import { Card, Flex, Skeleton, Tooltip } from '@dolanske/vui'

defineProps<{
  label: string
  value: string | number
  isLoading?: boolean
  icon?: string
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'gray'
  prefix?: string
  suffix?: string
  description?: string
}>()
</script>

<template>
  <Card class="kpi-card" :padding="false">
    <Flex column gap="m" expand>
      <Flex gap="m" y-center expand>
        <div v-if="icon" class="icon-container" :class="[variant || 'primary']">
          <Icon :name="icon" size="24" />
        </div>
        <Flex class="label" y-center x-between expand>
          {{ label }}
          <div v-if="description" class="description-icon">
            <Tooltip placement="top">
              <Icon name="ph:info" size="18" class="info-icon" />
              <template #tooltip>
                <div class="tooltip-content">
                  {{ description }}
                </div>
              </template>
            </Tooltip>
          </div>
        </Flex>
      </Flex>
      <div class="content">
        <div v-if="isLoading" class="value-container">
          <Skeleton :height="32" width="60%" />
        </div>
        <div v-else class="value-row">
          <div class="value" :class="[variant || 'primary']">
            {{ prefix }}{{ value }}{{ suffix }}
          </div>
        </div>
      </div>
    </Flex>
  </Card>
</template>

<style scoped>
.kpi-card {
  padding: var(--space-l);
  height: 100%;
  width: 100%;
  display: flex;
}

.icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: var(--border-radius-m);
}

.icon-container.primary {
  background-color: var(--color-bg-green-lowered);
  color: var(--color-text-green);
}

.icon-container.success {
  background-color: var(--color-bg-green-lowered);
  color: var(--color-text-green);
}

.icon-container.warning {
  background-color: var(--color-bg-yellow-lowered);
  color: var(--color-text-yellow);
}

.icon-container.danger {
  background-color: var(--color-bg-red-lowered);
  color: var(--color-text-red);
}

.icon-container.gray {
  background-color: var(--color-bg-medium);
  color: var(--color-text-light);
}

.content {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.label {
  font-size: var(--font-size-s);
  font-weight: 500;
  color: var(--color-text-light);
}

.value-container {
  margin-top: var(--space-xs);
}

.value-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.value {
  font-size: var(--font-size-xxl);
  font-weight: 700;
  line-height: 1.2;
}

.value.primary {
  color: var(--color-text-green);
}

.value.success {
  color: var(--color-text-green);
}

.value.warning {
  color: var(--color-text-yellow);
}

.value.danger {
  color: var(--color-text-red);
}

.value.gray {
  color: var(--color-text);
}

.description-icon {
  display: flex;
  align-items: center;
}

.info-icon {
  color: var(--color-text-light);
  opacity: 0.7;
  cursor: help;
  transition: opacity 0.2s ease;
}

.info-icon:hover {
  opacity: 1;
}

.tooltip-content {
  max-width: 250px;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
