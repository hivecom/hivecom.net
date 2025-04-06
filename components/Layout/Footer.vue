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
            Gameservers
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
