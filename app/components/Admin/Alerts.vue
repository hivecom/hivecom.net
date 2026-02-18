<script setup lang="ts">
import { Card, Flex, Skeleton } from '@dolanske/vui'
import { onBeforeMount, ref, watch } from 'vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

// Props
interface Props {
  refreshSignal?: number
}

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  icon: string
  timestamp: Date
}

const props = defineProps<Props>()

// Setup
const supabase = useSupabaseClient()
const loading = ref(true)
const alerts = ref<Alert[]>([])

// Fetch alert data
async function fetchAlerts() {
  loading.value = true
  const newAlerts: Alert[] = []
  const now = new Date()

  try {
    // Check for multiple pending complaints
    const { data: complaints } = await supabase
      .from('complaints')
      .select('id, created_at')
      .eq('acknowledged', false)
      .is('response', null)
      .order('created_at', { ascending: false })

    if (complaints && complaints.length > 0) {
      // Use the timestamp of the most recent complaint
      const latestComplaintTime = new Date(complaints[0].created_at)
      const severity = complaints.length > 1 ? 'critical' : 'warning'
      const title = complaints.length > 1 ? 'Multiple Pending Complaints' : 'Pending Complaint'

      newAlerts.push({
        id: 'pending-complaints',
        severity,
        title,
        message: `${complaints.length} unacknowledged complaint${complaints.length === 1 ? '' : 's'} require${complaints.length === 1 ? 's' : ''} attention`,
        icon: 'ph:warning-circle',
        timestamp: latestComplaintTime,
      })
    }

    // Check for no upcoming events
    const { data: events } = await supabase
      .from('events')
      .select('id, date')
      .gte('date', now.toISOString())

    if (!events || events.length === 0) {
      // Get the most recent past event to use as timestamp reference
      const { data: lastEvent } = await supabase
        .from('events')
        .select('date')
        .lt('date', now.toISOString())
        .order('date', { ascending: false })
        .limit(1)
        .single()

      const referenceTime = lastEvent ? new Date(lastEvent.date) : now
      newAlerts.push({
        id: 'no-events',
        severity: 'warning',
        title: 'No Upcoming Events',
        message: 'No events scheduled - consider planning community activities',
        icon: 'ph:calendar-x',
        timestamp: referenceTime,
      })
    }

    alerts.value = newAlerts
  }
  catch (error) {
    console.error('Error fetching alert data:', error)
  }
  finally {
    loading.value = false
  }
}

// Get severity indicator class
function getSeverityClass(severity: string) {
  switch (severity) {
    case 'critical': return 'alert-row--critical'
    case 'warning': return 'alert-row--warning'
    case 'info': return 'alert-row--info'
    default: return 'alert-row--info'
  }
}

// Get severity icon color
function getSeverityIconColor(severity: string) {
  switch (severity) {
    case 'critical': return 'var(--color-text-red)'
    case 'warning': return 'var(--color-text-yellow)'
    case 'info': return 'var(--color-text-blue)'
    default: return 'var(--color-text-light)'
  }
}

// Watch for refresh signal changes
watch(() => props.refreshSignal, () => {
  if (props.refreshSignal) {
    fetchAlerts()
  }
})

// Load data on mount
onBeforeMount(() => {
  fetchAlerts()
})
</script>

<template>
  <Card class="alerts-card" :padding="false">
    <Flex class="alerts-header" y-center x-between expand>
      <Flex y-center gap="s">
        <h3>{{ loading ? '...' : alerts.length }} {{ alerts.length > 1 ? 'Alerts' : 'Alert' }}</h3>
      </Flex>
    </Flex>

    <div v-if="loading" class="alerts-table">
      <div class="alerts-table-header">
        <div class="col-severity">
          Severity
        </div>
        <div class="col-title">
          Alert
        </div>
        <div class="col-date text-right">
          Date
        </div>
      </div>

      <div class="alerts-table-body">
        <div class="alert-row">
          <Flex class="alert-severity" y-center gap="xs" expand>
            <span style="width: 10px" />
            <Skeleton :height="32" :width="32" style="border-radius: 50%;" />
          </Flex>
          <div class="alert-content">
            <Skeleton :height="16" width="60%" />
            <Skeleton :height="12" width="80%" style="margin-top: 4px;" />
          </div>
          <Flex class="alert-timestamp" y-center x-end expand>
            <Skeleton :height="12" :width="40" />
          </Flex>
        </div>
      </div>
    </div>

    <Flex v-else-if="alerts.length === 0" class="alerts-empty" y-center x-center gap="m" expand>
      <span>Looks like it's all smooth sailing</span>
    </Flex>

    <div v-else class="alerts-table">
      <div class="alerts-table-header">
        <div class="col-severity">
          Severity
        </div>
        <div class="col-title">
          Alert
        </div>
        <div class="col-date text-right">
          Date
        </div>
      </div>

      <div class="alerts-table-body">
        <div
          v-for="alert in alerts"
          :key="alert.id"
          class="alert-row"
          :class="getSeverityClass(alert.severity)"
        >
          <Flex class="alert-severity" y-center gap="xs" expand>
            <span style="width: 10px" />
            <Icon
              :name="alert.icon"
              size="24"
              :style="{ color: getSeverityIconColor(alert.severity) }"
            />
          </Flex>
          <div class="alert-content">
            <div class="alert-title">
              {{ alert.title }}
            </div>
            <div class="alert-message">
              {{ alert.message }}
            </div>
          </div>
          <Flex class="alert-timestamp" y-center x-end expand>
            <TimestampDate
              :date="alert.timestamp.toISOString()"
              size="xs"
              :tooltip="true"
              format="YYYY-MM-DD"
            />
          </Flex>
        </div>
      </div>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
.alerts-card {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-l);
  background: var(--color-bg);
}

.alerts-header {
  padding: var(--space-l);
  border-bottom: 1px solid var(--color-border);

  h3 {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }
}

.alerts-count {
  min-width: 24px;
  height: 24px;
  padding: 0 var(--space-xs);
  border-radius: var(--border-radius-round);
  background: var(--color-bg-medium);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-medium);

  &--active {
    background: var(--color-bg-red);
  }
}

.alerts-empty {
  padding: var(--space-xl);
  color: var(--color-text-light);
  font-size: var(--font-size-s);
}

.alerts-table {
  &-header {
    display: grid;
    grid-template-columns: 80px 1fr 80px;
    gap: var(--space-m);
    padding: var(--space-m) var(--space-l);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-raised);

    div {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-light);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  }

  &-body {
    max-height: 300px;
    overflow-y: auto;
  }
}

.alert-row {
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  gap: var(--space-m);
  padding: var(--space-l);
  border-bottom: 1px solid var(--color-border);
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--color-bg-raised);
  }

  &:last-child {
    border-bottom: none;
  }

  &--critical {
    border-left: 3px solid var(--color-border-red);
  }

  &--warning {
    border-left: 3px solid var(--color-border-yellow);
  }

  &--info {
    border-left: 3px solid var(--color-border-blue);
  }
}

.alert-content {
  min-width: 0; // Allow text truncation
}

.alert-title {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-message {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-timestamp {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
  font-family: var(--font-family-mono);
}
</style>
