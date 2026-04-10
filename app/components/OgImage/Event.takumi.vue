<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { formatSimpleDate, formatTime } from '@/lib/utils/date'

const props = defineProps<{
  eventId: number
}>()

const supabase = useSupabaseClient()

const { data }: { data: Tables<'events'> | null } = await supabase
  .from('events')
  .select('*')
  .eq('id', props.eventId)
  .single()

const { count } = await supabase
  .from('events_rsvps')
  .select('*', { count: 'exact', head: true })
  .eq('event_id', props.eventId)
  .eq('rsvp', 'yes')

const { data: games } = await supabase
  .from('games')
  .select('name')
  .in('id', data!.games!)

const gamesToDisplay = games?.slice(0, 3).map(({ name }) => name)
const gamesRemainingCount = games?.slice(3, games.length).length ?? 0
const gamesLabel = gamesToDisplay?.join(', ') + (gamesRemainingCount > 0 ? ` +${gamesRemainingCount}` : '')
const hasGames = gamesToDisplay && gamesToDisplay.length > 0
const attendeeCount = count ?? 0
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

    <!-- Event label -->
    <p class="text-2xl text-[#a7fc2f] m-0 font-semibold tracking-widest uppercase">
      Event
    </p>

    <!-- Title -->
    <h1 class="text-6xl text-white m-0 leading-tight pr-40 shrink-0">
      {{ data.title }}
    </h1>

    <!-- Description -->
    <p
      v-if="data.description"
      class="text-3xl text-[#aeaeae] m-0 leading-snug pr-40 grow overflow-hidden line-clamp-2"
    >
      {{ data.description }}
    </p>

    <!-- Spacer when no description -->
    <div v-else class="grow" />

    <!-- Meta bar -->
    <div class="flex flex-row gap-12 mt-auto w-full px-8 py-6 border border-[#242424] rounded-2xl bg-[#0a0a0a] box-border">
      <!-- Date -->
      <div class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16ZM72 48v8a8 8 0 0 0 16 0v-8h80v8a8 8 0 0 0 16 0v-8h24v32H48V48Zm136 160H48V96h160v112Z" />
        </svg>
        {{ formatSimpleDate(data.date) }}
      </div>

      <!-- Time -->
      <div class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.2 104.2 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88Zm64-88a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 8 8Z" />
        </svg>
        {{ formatTime(data.date) }}
      </div>

      <!-- Attendees - hidden when 0 -->
      <div
        v-if="attendeeCount > 0"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M231.9 212a120.7 120.7 0 0 0-67.1-54.2a72 72 0 1 0-73.6 0A120.7 120.7 0 0 0 24.1 212a8 8 0 1 0 13.8 8a104.1 104.1 0 0 1 180.2 0a8 8 0 1 0 13.8-8ZM72 96a56 56 0 1 1 56 56a56 56 0 0 1-56-56Z" />
        </svg>
        {{ attendeeCount }} going
      </div>

      <!-- Games - inline in meta bar -->
      <div
        v-if="hasGames"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M184 116h-32a8 8 0 0 1 0-16h32a8 8 0 0 1 0 16Zm-80-16h-8v-8a8 8 0 0 0-16 0v8h-8a8 8 0 0 0 0 16h8v8a8 8 0 0 0 16 0v-8h8a8 8 0 0 0 0-16Zm114.3 123.4a33.6 33.6 0 0 1-6.3.6a36 36 0 0 1-25.4-10.5l-.5-.5l-40.6-45.2l-34.9.2l-40.7 45l-.4.5A36.4 36.4 0 0 1 44 224a31.8 31.8 0 0 1-6.2-.6a35.9 35.9 0 0 1-29.2-41.7l16.3-83.9v-.2A59.9 59.9 0 0 1 84 48l88-.3A60 60 0 0 1 231 97c.1.1.1.1.1.2l16.3 84.4h.1a36.1 36.1 0 0 1-29.2 41.8ZM172 151.7a44 44 0 1 0 0-88L84 64a43.9 43.9 0 0 0-43.3 36a.9.9 0 0 1-.1.5l-16.3 84.1A20 20 0 0 0 58 202.3l43.1-47.7a8.3 8.3 0 0 1 5.9-2.6Zm59.7 32.9l-8.7-45.2a60 60 0 0 1-51 28.3h-5.1l31.1 34.6a20 20 0 0 0 33.7-17.7Z" />
        </svg>
        {{ gamesLabel }}
      </div>
    </div>
  </div>
</template>
