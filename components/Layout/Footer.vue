<script setup>
import constants from '@/constants.json'

const links = constants.LINKS
</script>

<template>
  <footer>
    <div class="footer-items">
      <SharedThemeToggle no-text small />
      <div class="footer-links">
        <span class="footer-links-separator" />
        <div class="footer-links-group">
          <NuxtLink to="/">
            Home
          </NuxtLink>
          <NuxtLink to="/community">
            Community
          </NuxtLink>
          <NuxtLink to="/events">
            Events
          </NuxtLink>
          <NuxtLink to="/gameservers">
            Game Servers
          </NuxtLink>
        </div>
        <span class="footer-links-separator" />
        <div class="footer-links-group">
          <NuxtLink to="/legal/terms">
            Terms of Service
          </NuxtLink>
          <NuxtLink to="/legal/privacy">
            Privacy Policy
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="footer-social-links">
      <a v-for="(link, key) in links" :key="key" :href="link.url" target="_blank" rel="noopener noreferrer" class="footer-social-link">
        <Icon :name="link.icon" />
      </a>
    </div>

    <div class="footer-established-text">
      HIVECOM | EST. IN 2013
    </div>
  </footer>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

footer {
  background: var(--color-bg-lowered);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-m);
  padding: var(--space-l) 0;

  .footer-items {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: 100%;
    gap: var(--space-s);

    @media screen and (max-width: $breakpoint-sm) {
      flex-direction: column;
      align-items: center;
    }

    .footer-links {
      display: flex;
      flex-direction: row;
      gap: var(--space-s);

      @media screen and (max-width: $breakpoint-sm) {
        // On mobile, stack the links. Make sure the width is 100% and center them.
        width: 100%;
        flex-direction: column;
        gap: var(--space-m);
        text-align: center;
        align-items: center;
      }

      &-group {
        display: flex;
        gap: var(--space-s);

        @media screen and (max-width: $breakpoint-sm) {
          width: 95%;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          padding: var(--space-l);
          border-radius: var(--border-radius-s);

          background-color: var(--color-bg-raised);
          gap: var(--space-m);
          align-items: center;
        }
      }

      &-separator {
        display: block;
        position: relative;
        width: 1px;
        height: 16px;
        background: var(--color-text);
        opacity: 0.25;

        @media screen and (max-width: $breakpoint-sm) {
          display: none;
        }
      }
    }
  }

  .footer-social-links {
    display: flex;
    flex-direction: row;

    .footer-social-link {
      &:first-child {
        margin-left: 0;
      }

      &:last-child {
        margin-right: 0;
      }

      display: flex;
      justify-content: center;
      align-items: center;

      width: 32px;
      height: 32px;
      margin: 0 var(--space-s);

      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-3px);
        background-color: var(--color-bg-active);
      }

      .icon {
        font-size: 16px;
      }
    }

    @media screen and (max-width: $breakpoint-sm) {
      width: 100%;
      justify-content: space-between;
      padding: 0 var(--space-m);

      .footer-social-link {
        width: 100%;
        height: 64px;
        background-color: var(--color-bg-raised);
        border-radius: var(--border-radius-s);

        .icon {
          font-size: 32px;
        }
      }
    }
  }

  .footer-established-text {
    font-size: 0.8rem;
    letter-spacing: 1px;
    opacity: 0.7;
  }
}
</style>
