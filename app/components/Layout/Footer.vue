<script setup>
import { Button, Card, Flex } from '@dolanske/vui'
import constants from '~~/constants.json'
import { navigationLinks } from '@/lib/navigation'

// const links = constants.LINKS
</script>

<template>
  <!-- <footer class="footer">
    <div class="footer__items">
      <SharedThemeToggle no-text small />
      <div class="footer__links">
        <span class="footer__links-separator" />
        <div class="footer__links-group">
          <NuxtLink to="/">
            Home
          </NuxtLink>
          <NuxtLink to="/community">
            Community
          </NuxtLink>
          <NuxtLink to="/events">
            Events
          </NuxtLink>
          <NuxtLink to="/servers/gameservers">
            Game Servers
          </NuxtLink>
        </div>
        <span class="footer__links-separator" />
        <div class="footer__links-group">
          <NuxtLink to="/legal/terms">
            Terms of Service
          </NuxtLink>
          <NuxtLink to="/legal/privacy">
            Privacy Policy
          </NuxtLink>
        </div>
        <span class="footer__links-separator" />
        <Flex class="footer__links-group text-center" x-center>
          <NuxtLink external to="https://github.com/hivecom/hivecom.net">
            Source Code
          </NuxtLink>
        </Flex>
      </div>
    </div>

    <div class="footer__social-links">
      <NuxtLink v-for="(link, key) in links" :key="key" external :to="link.url" target="_blank" rel="noopener noreferrer" class="footer__social-link" :aria-label="`Visit our ${link.name} page`">
        <Icon :name="link.icon" />
      </NuxtLink>
    </div>

    <Flex class="footer__established-text">
      HIVECOM | EST. IN 2013
    </Flex>
  </footer> -->

  <footer class="footer">
    <div class="container container-m">
      <Flex x-between>
        <div>
          <img src="/logotype-white.svg" class="footer__logo">
          <p class="footer__established">
            Established in 2013
          </p>
        </div>
        <!-- <Flex class="footer__links-group text-center" x-center>
          <NuxtLink external to="https://github.com/hivecom/hivecom.net">
            Source Code
          </NuxtLink>
        </Flex> -->
        <!-- <SharedThemeToggle no-text /> -->
        <div class="footer__social-links">
          <NuxtLink v-for="(link, key) in constants.LINKS" :key="key" external :to="link.url" target="_blank" rel="noopener noreferrer" :data-title-top="`Visit our ${link.name} page`">
            <Button square outline>
              <Icon :name="link.icon" />
            </Button>
          </NuxtLink>
        </div>
      </Flex>

      <Card class="mt-xl">
        <Flex x-between>
          <Button v-for="link in navigationLinks" :key="link.path" variant="link" :href="link.path">
            {{ link.label }}
          </Button>
        </Flex>
      </Card>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

:deep(.vui-card .vui-card-content) {
  padding: 4px;

  a:hover {
    color: var(--color-accent);
  }
}

:root.light .footer__logo {
  filter: invert(1);
}

.footer {
  width: 100%;
  padding-block: var(--space-xxl);
  background-color: var(--color-bg);
  border-top: 1px solid var(--color-border);

  &__logo {
    display: block;
    height: 24px;
    margin-bottom: var(--space-m);
  }

  &__established {
    font-size: var(--font-size-m);
    color: var(--color-text-lighter);
  }

  &__social-links {
    display: flex;
    flex-direction: row;
    gap: var(--space-xs);

    @media screen and (max-width: $breakpoint-s) {
      width: 100%;
      justify-content: space-between;
      padding: 0 var(--space-m);
    }
  }

  // &__social-link {
  //   display: flex;
  //   justify-content: center;
  //   align-items: center;
  //   width: 24px;
  //   height: 24px;
  //   margin: 0 var(--space-s);
  //   transition: all 0.2s ease;

  //   &:hover {
  //     transform: translateY(-3px);
  //     background-color: var(--color-bg-active);
  //   }

  //   .icon {
  //     font-size: 16px;
  //   }

  //   @media screen and (max-width: $breakpoint-s) {
  //     width: 100%;
  //     height: 64px;
  //     background-color: var(--color-bg-raised);
  //     border-radius: var(--border-radius-s);

  //     .icon {
  //       font-size: 32px;
  //     }
  //   }
  // }
}

// .footer {
//   background: var(--color-bg-lowered);
//   display: flex;
//   flex-direction: column;
//   align-items: center;
//   gap: var(--space-m);
//   padding: var(--space-l) 0;

//   &__items {
//     display: flex;
//     flex-direction: row;
//     justify-content: center;
//     align-items: center;
//     width: 100%;
//     gap: var(--space-s);

//     @media screen and (max-width: $breakpoint-s) {
//       flex-direction: column;
//       align-items: center;
//     }
//   }

//   &__links {
//     display: flex;
//     flex-direction: row;
//     gap: var(--space-s);

//     @media screen and (max-width: $breakpoint-s) {
//       // On mobile, stack the links. Make sure the width is 100% and center them.
//       width: 100%;
//       flex-direction: column;
//       gap: var(--space-m);
//       text-align: center;
//       align-items: center;
//     }
//   }

//   &__links-group {
//     font-size: var(--font-size-s);
//     display: flex;
//     gap: var(--space-s);

//     @media screen and (max-width: $breakpoint-s) {
//       width: 95%;
//       display: grid;
//       grid-template-columns: repeat(2, 1fr);
//       padding: var(--space-l);
//       border-radius: var(--border-radius-s);
//       background-color: var(--color-bg-raised);
//       gap: var(--space-m);
//       align-items: center;
//     }
//   }

//   &__links-separator {
//     display: block;
//     position: relative;
//     width: 1px;
//     height: 16px;
//     background: var(--text-color);
//     opacity: 0.25;

//     @media screen and (max-width: $breakpoint-s) {
//       display: none;
//     }
//   }

//   &__established-text {
//     font-size: var(--font-size-xxs);
//     letter-spacing: 1px;
//     opacity: 0.7;
//   }
// }
</style>
