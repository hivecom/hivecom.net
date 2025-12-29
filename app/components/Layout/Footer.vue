<script setup>
import { Button, Card, Flex, Tooltip } from '@dolanske/vui'
import constants from '~~/constants.json'
import { navigationLinks } from '@/lib/navigation'

function scrollUp() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <footer class="footer">
    <div class="container container-footer">
      <Flex x-between>
        <div>
          <img src="/logotype-white.svg" class="footer__logo">
          <p class="footer__established">
            Established in 2013
          </p>
        </div>
        <div class="footer__social-links">
          <Tooltip>
            <SharedThemeToggle button no-text />
            <template #tooltip>
              <p>
                Toggle theme
              </p>
            </template>
          </Tooltip>
          <Tooltip v-for="(link, key) in constants.LINKS" :key="key">
            <NuxtLink
              external :to="link.url" target="_blank"
              rel="noopener noreferrer"
            >
              <Button square outline>
                <Icon :name="link.icon" />
              </Button>
            </NuxtLink>
            <template #tooltip>
              <p>
                Visit our {{ link.name }}
              </p>
            </template>
          </Tooltip>
        </div>
      </Flex>

      <Card class="mt-xl footer__navigation card-bg" separators>
        <Flex x-center gap="none">
          <Button v-for="link in navigationLinks" :key="link.path" variant="link" :href="link.path">
            {{ link.label }}
          </Button>

          <Button class="footer__scroll-up" square plain data-title-left="Scroll up" @click="scrollUp">
            <Icon name="ph:arrow-up" />
          </Button>
        </Flex>

        <template #footer>
          <Flex x-center gap="0" class="footer__legals">
            <NuxtLink to="/legal/terms">
              <Button variant="link">
                Terms of Service
              </Button>
            </NuxtLink>
            <NuxtLink to="/legal/privacy">
              <Button variant="link">
                Privacy Policy
              </Button>
            </NuxtLink>
          </Flex>
        </template>
      </Card>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

:root.light .footer__logo {
  filter: invert(1);
}

:root.dark .footer .card-bg {
  background-color: var(--color-bg-raised);
}

.footer {
  width: 100%;
  padding-block: 64px;
  background-color: var(--color-bg-medium);
  border-top: 1px solid var(--color-border);

  .container-footer {
    max-width: 932px;
  }

  :deep(.vui-card .vui-card-content),
  :deep(.vui-card .vui-card-footer) {
    padding: 4px;
  }

  @media (max-width: $breakpoint-s) {
    padding-block: var(--space-xl);

    .vui-flex {
      flex-direction: column !important;
      align-items: center !important;
    }

    .footer__established {
      text-align: center;
      margin-bottom: var(--space-m);
    }

    .footer__navigation {
      opacity: 1;
    }
  }

  a:hover {
    color: var(--color-accent);
  }

  &:hover {
    .footer__navigation {
      opacity: 1;
    }
  }

  &__logo {
    display: block;
    height: 28px;
    margin-bottom: var(--space-m);
  }

  &__established {
    font-size: var(--font-size-m);
    color: var(--color-text-lighter);
  }

  &__social-links {
    display: flex;
    flex-direction: row;
    gap: var(--space-xxs);
  }

  &__navigation {
    opacity: 0.65;
    transition: var(--transition-slow);
  }

  &__legals {
    a {
      font-size: var(--font-size-m);

      &:hover {
        .vui-button.vui-button-variant-link {
          color: var(--color-accent);
        }
      }

      .vui-button.vui-button-variant-link {
        color: var(--color-text-lighter);
      }
    }
  }

  &__scroll-up {
    position: absolute;
    top: 4px;
    right: 4px;
  }
}
</style>
