<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'

const props = defineProps<{
  username: string | undefined
  userId: string | undefined
}>()

const supabase = useSupabaseClient()

let data: Pick<Tables<'profiles'>, 'username' | 'introduction' | 'country' | 'badges' | 'supporter_patreon' | 'supporter_lifetime' | 'created_at'> | null = null

if (props.userId != null || props.username != null) {
  let query = supabase
    .from('profiles')
    .select('username, introduction, country, badges, supporter_patreon, supporter_lifetime, created_at')

  if (props.userId != null) {
    query = query.eq('id', props.userId)
  }
  else {
    query = query.eq('username', props.username as string)
  }

  const result = await query.maybeSingle()
  data = result.data
}

const memberYear = data?.created_at != null ? new Date(data.created_at).getFullYear() : null

const visibleBadges = data?.badges != null ? data.badges.slice(0, 4) : []

const supporterLabel = data?.supporter_lifetime === true
  ? 'Lifetime Supporter'
  : data?.supporter_patreon === true
    ? 'Supporter'
    : null

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
</script>

<template>
  <div
    v-if="data"
    class="relative flex flex-col w-full h-full bg-[#111111] text-white font-sans py-12 px-16 gap-4 box-border"
  >
    <!-- Background light leak -->
    <img
      src="/leak.png"
      alt=""
      class="absolute top-0 left-0 w-full h-full object-cover opacity-30 mix-blend-screen"
    >

    <!-- Logo -->
    <img
      src="/icon.svg"
      alt="Hivecom"
      class="absolute top-12 right-16 w-18 h-18"
    >

    <!-- Section label -->
    <p class="text-2xl text-[#a7fc2f] m-0 font-semibold tracking-widest uppercase">
      Member
    </p>

    <!-- Username -->
    <h1 class="text-6xl text-white m-0 leading-tight pr-40 shrink-0">
      @{{ data.username }}
    </h1>

    <!-- Introduction -->
    <p
      v-if="data.introduction != null && data.introduction !== ''"
      class="text-3xl text-[#aeaeae] m-0 leading-snug pr-40 grow overflow-hidden line-clamp-2"
    >
      {{ data.introduction }}
    </p>

    <!-- Spacer when no introduction -->
    <div
      v-else
      class="grow"
    />

    <!-- Badges + supporter pills -->
    <div
      v-if="visibleBadges.length > 0 || supporterLabel != null"
      class="flex flex-row gap-2"
    >
      <span
        v-for="badge in visibleBadges"
        :key="badge"
        class="inline-block px-3 py-1 text-xl rounded-full border border-[#a7fc2f] text-[#a7fc2f]"
      >
        {{ capitalize(badge) }}
      </span>

      <span
        v-if="supporterLabel != null"
        class="inline-block px-3 py-1 text-xl rounded-full border border-[#e9a800] text-[#e9a800]"
      >
        {{ supporterLabel }}
      </span>
    </div>

    <!-- Meta bar -->
    <div class="flex flex-row gap-12 mt-auto pt-6 border-t border-[#242424]">
      <!-- Country -->
      <div
        v-if="data.country != null && data.country !== ''"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path
            fill="currentColor"
            d="M128 16a96 96 0 1 0 96 96A96.2 96.2 0 0 0 128 16Zm0 176a80 80 0 1 1 80-80a80.1 80.1 0 0 1-80 80Zm0-104a24 24 0 1 0 24 24a24 24 0 0 0-24-24Z"
          />
        </svg>
        {{ data.country }}
      </div>

      <!-- Member since -->
      <div
        v-if="memberYear != null"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path
            fill="currentColor"
            d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16ZM72 48v8a8 8 0 0 0 16 0v-8h80v8a8 8 0 0 0 16 0v-8h24v32H48V48Zm136 160H48V96h160v112Z"
          />
        </svg>
        Member since {{ memberYear }}
      </div>
    </div>
  </div>
</template>
