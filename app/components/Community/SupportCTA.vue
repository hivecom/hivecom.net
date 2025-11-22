<script setup lang="ts">
import { Card, Flex } from '@dolanske/vui'
import constants from '~~/constants.json'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'

interface Props {
  supporterCount?: number
  supporterIds?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  supporterCount: 0,
  supporterIds: () => [],
})

// Fetch supporter count if not provided
const actualSupporterCount = ref(props.supporterCount)

// Get current user for authentication check
const currentUser = useSupabaseUser()

onMounted(async () => {
  // Only fetch if supporter count is not provided (defaulted to 0)
  if (props.supporterCount === 0) {
    try {
      const supabase = useSupabaseClient()
      const { data, error } = await supabase
        .from('monthly_funding')
        .select('patreon_count, donation_count')
        .order('month', { ascending: false })
        .limit(1)
        .single()

      if (!error && data) {
        actualSupporterCount.value = (data.patreon_count || 0) + (data.donation_count || 0)
      }
    }
    catch (error) {
      // Silently fail - supporter count will remain 0
      console.warn('Failed to fetch supporter count:', error)
    }
  }
  else {
    actualSupporterCount.value = props.supporterCount
  }
})
</script>

<template>
  <Card class="support-card" expand>
    <Flex column gap="l" y-center expand>
      <!-- Header -->
      <Flex column y-center gap="s" class="mb-l">
        <Icon name="ph:heart" size="3rem" />
        <h3 class="text-bold text-xl mb-s">
          Support Hivecom
        </h3>
        <p class="text-color-light text-l">
          Help us maintain servers, support projects, and keep the community thriving
        </p>
        <p class="text-color-lighter text-s">
          You'll also receive a supporter badge on your Hivecom profile as well as a Discord and TeamSpeak role to represent your contribution
        </p>
      </Flex>

      <!-- Call to Action -->
      <div>
        <NuxtLink
          :to="constants.PATREON.URL"
          external
          target="_blank"
          class="support-button"
          aria-label="Become a Patron on Patreon to support our community"
        >
          <Flex y-center x-center gap="s" class="support-button-content">
            <Icon name="ph:heart-fill" size="1.6rem" />
            <span class="text-l text-bold">Become a Patron</span>
          </Flex>
        </NuxtLink>
        <p class="mt-s text-s text-color-light">
          Join {{ actualSupporterCount }} supporters helping fund our community
        </p>
        <BulkAvatarDisplay
          v-if="currentUser"
          :user-ids="props.supporterIds"
          :max-users="16"
          :avatar-size="48"
          :random="true"
          :gap="4"
          class="pt-m"
        />
      </div>

      <!-- Benefits -->
      <Flex column y-center class="support-benefits" expand>
        <h4 class="text-bold mb-s text-color-light text-s">
          Your support helps with
        </h4>
        <Flex x-center gap="l" class="benefits-list" expand>
          <Flex column y-center gap="xs">
            <Icon name="ph:database" size="1.8rem" class="color-accent" />
            <span class="text-xs text-color-light">Server Costs</span>
          </Flex>
          <Flex column y-center gap="xs">
            <Icon name="ph:code" size="1.8rem" class="color-accent" />
            <span class="text-xs text-color-light">Development</span>
          </Flex>
          <Flex column y-center gap="xs">
            <Icon name="ph:users" size="1.8rem" class="color-accent" />
            <span class="text-xs text-color-light">Community</span>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.support-card {
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
  text-align: center;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-accent), var(--color-bg-accent-raised));
  }
}

.support-button {
  display: inline-block;
  background: var(--color-accent);
  border: none;
  border-radius: var(--border-radius-m);
  padding: var(--space-m) var(--space-l);
  color: var(--color-text-invert);
  text-decoration: none;
  transition: all 0.3s ease;
  box-shadow:
    0 4px 12px var(--color-bg-accent-lowered),
    0 2px 4px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s ease;
  }

  &:hover {
    transform: translateY(-2px);
    background: var(--color-accent);
    box-shadow:
      0 6px 20px var(--color-bg-accent-lowered),
      0 4px 8px rgba(0, 0, 0, 0.15);

    &::before {
      left: 100%;
    }
  }

  &:active {
    transform: translateY(0);
  }
}

.support-button-content {
  position: relative;
  z-index: 1;
}

.support-benefits {
  padding: var(--space-l);
  background: var(--color-bg-medium);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border-weak);
}

.supporters-section {
  padding: var(--space-l);
  background: var(--color-bg-medium);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border-weak);
  width: 100%;
}

.benefits-list {
  @media (max-width: 768px) {
    flex-direction: column;
    gap: var(--space-m);
  }
}
</style>
