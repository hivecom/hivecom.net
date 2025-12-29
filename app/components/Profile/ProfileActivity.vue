<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import RegionIndicator from '../Shared/RegionIndicator.vue'

// TODO: move teamspeak rich presence from next to the name (in profile) to this component
</script>

<template>
  <div class="activity">
    <!-- TODO: CLicking activity item could redirect somewhere depending on the type -->
    <div class="activity__item activity__item--clickable">
      <Flex y-center x-between gap="s">
        <div>
          <span class="activity__label">
            <div class="activity__bars">
              <span class="activity__bars--bar" />
              <span class="activity__bars--bar" />
              <span class="activity__bars--bar" />
            </div>
            Now listening</span>
          <strong class="activity__title">Haywyre - Midnight Mist</strong>
        </div>

        <img width="24" height="24" src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5OjcBCgoKDQwNGg8PGjclHyU3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIADgAOAMBEQACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAAFBgIDBAcBAP/EADIQAAEEAAQEBQEHBQAAAAAAAAECAwQRAAUSIRMxQVEGFCJhcYEVIzIzkbHxQlLB0eH/xAAaAQABBQEAAAAAAAAAAAAAAAACAAEDBAUG/8QAKhEAAQMDAwIFBQEAAAAAAAAAAQACAwQRIRIxQVHwBRMiYYEycZGhseH/2gAMAwEAAhEDEQA/AAGY+IZCJjiYLqFsjkS3+tdxjSdMb+lc7FSNLBrGVfnOfOxpnBguIWEil2i6V2B64KSUg2ao4KVrmXeEdguqfhMPOVqW2lRruRidpuAVTkaGvICvw6BZ8xdWxAkOtmlobUpJrkawLjZpKkiaHPAKAZPnj6pamsyfKbTSAUJSAr32xBHKb2cVdnpmht4wqMuz2Wma0MxkLDChf5aRz5E7XXxhmSuv6ijlpWaD5YyhzM0Roi246Alx0FLrityU9h2xGHWFgp3R6nXdsNlCO4ttTPk+J5okiwAeewA98MMbbonAEHXsnXJFLVlUcu3rCSCCKqiRi5H9Iusiot5pstPGT94ADqQLKetYWsZHIQ+WbA8FZc6Li8qe8tqLignRo5m1DDPN2XajhAbKA7hJchSyp1ExLplJUPUtVn4OKhvzutZoGCzZSenKkREtSU8RbdBty6KR25b/AFw5dcWKZsYa67eVnBAUNt8CjRXwxxPtVpek8NQWnUU7E6bq8Sw31KtV28sjlO8dtLr6G1uaAq96v3oe+I/Eqt1LAZGC7th0+fsqtDTCpm0E2G5WiPHy2RmI4qXi2GVCkFWpRvcVzJ2xytbV1rqfzQ/1AjgAAHv3K6aCnghOhjd/fOFVOhpy+a7FbUVNIotk/wBpFgfTlje8ArZKyibI8bXHyCsHxaFkVQdPObJF8SofOZvvFCyynSjVW34QavGhMDquipC3ywOUKKrJ23/fESso/wCCcnZzXxI1EzFLjcdAW47QAV6em47kWO14Ek2wiaATYrqMnKo6YYjR0NMuPOhw0kJANKKjpvbrVD2+K9ZXiihM5FwMAdSdghFGJzovk5P79/wvEsw4rbjMBtTq1p9bi9zQ7f8AMcVJUVtZI2eufYNOGjAz3ytiClhpwREN+UtIK2c9SVNvffEFGpJQQbFEXXL/ADjRL2SQmxBA35UlrFbJRkzg69wzoiWl07Um1EA99+3TG54FRmmaZNWJACB8c+/954XP+KTCc2a36NysMmPqStiS0aUKUhaa2PtjocOCxvUx3QpNzTIZLMtLcRpyQh002G0FSh7ED98VJIy0rWp5xKLcrryH4rmapejtqD60C31kDzCLCVK01+Khe2ALXBljt/CjEjHTam7kb9Rfp1UZLpEI7BJLgUoC70qUUpJ9jQ59+mM7xOMOgPtbv4Vyif67dex/Ev5lmsiBIQIxDax6tZ6jlWOfNPHMwtkFwtS5GyEyswmzZzapjxkNt6dKUkbGtXP4sfxjUpPDGNhcImAEppJ444yZD7+/eU45NLkKyiVDGV6zLUo8c+lA1dT3rpWNuOmELY2h30gD8LAZK+Rsg8v6ic/f9qbfh5KhrmSFvPEiybqh052f1xZ1nYYTMombyHUUXjxmY6aYZQ30JQkC8ArbWhowEGiKjskoSs6fSUF0gkDkDYoAnlzutvbAu1OyqMehuB+/xvgfu6KTUR34a4wcUBoNvqITv/UbIob9+tjtis5msEO2KvhwbbTxz/e/hJ8TIs1nlT8thLZWKHENbfG5v5wqOkjprk5KirDLUFoZhuD8/wCI9l+RQsni8eWpLyo6CouuAAIAG5F8vnFloDWho2CkIBkdJy7fvoiWSTftbLWpxZcipdsobeHq03sT8ij9cNqPREBcbrclABPqQfkXhiSeEQFuVJzSGqBTd9MM2+q6RtpQnNsrZgJUWJwXNQEGMwpKCtVE1fVW5O522F3WFHIXHIxyqc9MI76X3cLWGL/799tr7L6BALLi3XVuaVr1pjlzUhB79AVe9f7xKc2RRRaCSTvxwO+qWEeHfELSHAiclanI7zICnaDOt0GwQLPovnyOw2wFipbFXo8MT3o2Wx5zwWiO+puTpfVUiLZUlKgRudQSN+l774Wkp7dVRD8KZs3m7bkiaF5cJK9THFP5Astj51KII7VhaUwC9d8J5mrL0stzVcfzalF115S6ZShSWk+9Wmx8m8LSlYq3J8hzeLnkeXKpxhLTSDcwqKSloIUaKPVat+YwgEs3X//Z" alt="">
      </Flex>
    </div>

    <div class="activity__item">
      <Flex y-center x-between gap="s">
        <div>
          <span class="activity__label">
            <Icon class="activity__icon" name="mdi:steam" size="13" />
            Playing</span>
          <strong class="activity__title">Minecraft</strong>
        </div>

        <!-- Replace image with game icon later -->
        <img src="https://camqocmuyolpjjbnbcha.supabase.co/storage/v1/object/public/hivecom-content-static/games/minecraft/icon.webp" alt="Minecraft icon" width="24" height="24">
      </Flex>
    </div>

    <div class="activity__item">
      <Flex y-center x-between gap="s">
        <div>
          <span class="activity__label">
            <Icon class="activity__icon" name="mdi:steam" size="13" />
            Voice</span>
          <strong class="activity__title">#poke-if-needed</strong>
        </div>

        <RegionIndicator size="xxl" region="eu" :show-label="false" />
      </Flex>
    </div>
  </div>
</template>

<style lang="scss">
.activity {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-card);
  overflow: hidden;

  &__label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-s);
    color: var(--color-text-lightest);
    margin-bottom: var(--space-xxs);
  }

  &__title {
    font-size: var(--font-size-m);
    padding-left: 21px;
    color: var(--color-text-light);
  }

  &__icon {
    color: var(--color-accent);
  }

  &__item {
    padding: var(--space-s) var(--space-m);

    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
    }

    img {
      border-radius: 4px;
    }

    &--clickable:hover {
      cursor: pointer;
      background-color: var(--color-bg-raised);
    }
  }

  &__bars {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    width: 13px;
    height: 13px;

    &--bar {
      width: 3px;
      height: 100%;
      background-color: var(--color-accent);
      border-radius: 3px;
      transform-origin: bottom;
      animation: bar-bounce 2.5s ease infinite alternate;

      &:nth-of-type(2) {
        animation-delay: -2.2s;
      }

      &:nth-of-type(3) {
        animation-delay: -3.7s;
      }
    }
  }
}

@keyframes bar-bounce {
  10% {
    transform: scaleY(0.3); /* start by scaling to 30% */
  }

  30% {
    transform: scaleY(1); /* scale up to 100% */
  }

  60% {
    transform: scaleY(0.5); /* scale down to 50% */
  }

  80% {
    transform: scaleY(0.75); /* scale up to 75% */
  }

  100% {
    transform: scaleY(0.6); /* scale down to 60% */
  }
}
</style>
