<script setup lang="ts">
interface GameserverData {
  name: string
  description: string | null
  region: string | null
  addresses: string[] | null
  game: { name: string | null } | null
}

const props = defineProps<{
  gameserverId: number
}>()

const supabase = useSupabaseClient()

const result = await supabase
  .from('gameservers')
  .select('name, description, region, addresses, game:games(name)')
  .eq('id', props.gameserverId)
  .single()

const data = result.data as GameserverData | null

const titleFontSize = data?.name != null && data.name.length > 60 ? 'text-5xl' : 'text-6xl'
const gameName = data?.game?.name ?? null
const region = data?.region != null ? data.region.toUpperCase() : null
const firstAddress = Array.isArray(data?.addresses) && data.addresses.length > 0 ? data.addresses[0] : null
</script>

<template>
  <div class="relative flex flex-col w-full h-full bg-[#111111] text-white font-sans py-12 px-16 gap-4 box-border">
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
      Game Server
    </p>

    <!-- Title -->
    <h1
      class="m-0 leading-tight pr-40 shrink-0 text-white"
      :class="titleFontSize"
    >
      {{ data?.name ?? 'Game Server' }}
    </h1>

    <!-- Description -->
    <p
      v-if="data?.description"
      class="text-3xl text-[#aeaeae] m-0 leading-snug pr-40 grow overflow-hidden line-clamp-2"
    >
      {{ data.description }}
    </p>

    <!-- Spacer when no description -->
    <div
      v-else
      class="grow"
    />

    <!-- Meta bar -->
    <div class="flex flex-row gap-12 w-full px-8 py-6 border border-[#242424] rounded-2xl bg-[#0a0a0a] box-border mt-auto">
      <!-- Game name -->
      <div
        v-if="gameName"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M176 112h-24a8 8 0 0 1 0-16h24a8 8 0 0 1 0 16m-72-16h-8v-8a8 8 0 0 0-16 0v8h-8a8 8 0 0 0 0 16h8v8a8 8 0 0 0 16 0v-8h8a8 8 0 0 0 0-16m137.48 104.65a36 36 0 0 1-54.94 4.81c-.12-.12-.24-.24-.35-.37L146.48 160h-37l-39.67 45.09l-.35.37A36.08 36.08 0 0 1 44 216a36 36 0 0 1-35.44-42.25a.7.7 0 0 1 0-.14l16.37-84.09A59.88 59.88 0 0 1 83.89 40H172a60.08 60.08 0 0 1 59 49.25v.18l16.37 84.17a.7.7 0 0 1 0 .14a35.74 35.74 0 0 1-5.89 26.91M172 144a44 44 0 0 0 0-88H83.89a43.9 43.9 0 0 0-43.21 36.37v.13L24.3 176.59A20 20 0 0 0 58 194.3l41.92-47.59a8 8 0 0 1 6-2.71Zm59.7 32.59l-8.74-45A60 60 0 0 1 172 160h-4.2l30.2 34.31a20.09 20.09 0 0 0 17.46 5.39a20 20 0 0 0 16.23-23.11Z" />
        </svg>
        {{ gameName }}
      </div>

      <!-- Region -->
      <div
        v-if="region"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24Zm87.1 96H176a152.1 152.1 0 0 0-18.5-73.8A88.2 88.2 0 0 1 215.1 120ZM128 215.7a147.5 147.5 0 0 1-28.3-79.7h56.6a147.5 147.5 0 0 1-28.3 79.7ZM99.7 120a147.5 147.5 0 0 1 28.3-79.7a147.5 147.5 0 0 1 28.3 79.7ZM98.5 46.2A152.1 152.1 0 0 0 80 120H40.9a88.2 88.2 0 0 1 57.6-73.8ZM40.9 136H80a152.1 152.1 0 0 0 18.5 73.8A88.2 88.2 0 0 1 40.9 136Zm118.6 73.8A152.1 152.1 0 0 0 176 136h39.1a88.2 88.2 0 0 1-57.6 73.8Z" />
        </svg>
        {{ region }}
      </div>

      <!-- Connect address -->
      <div
        v-if="firstAddress"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M240 88.23a54.43 54.43 0 0 1-16 37L189.25 160a54.27 54.27 0 0 1-38.63 16h-.05A54.63 54.63 0 0 1 96 119.84a8 8 0 0 1 16 .45A38.62 38.62 0 0 0 150.58 160a38.4 38.4 0 0 0 27.31-11.31l34.75-34.75a38.63 38.63 0 0 0-54.63-54.63l-11 11A8 8 0 0 1 135.7 59l11-11a54.65 54.65 0 0 1 77.3 0a54.86 54.86 0 0 1 16 40.23m-131 97.43l-11 11A38.4 38.4 0 0 1 70.6 208a38.63 38.63 0 0 1-27.29-65.94L78 107.31a38.63 38.63 0 0 1 66 28.4a8 8 0 0 0 16 .45A54.86 54.86 0 0 0 144 96a54.65 54.65 0 0 0-77.27 0L32 130.75A54.62 54.62 0 0 0 70.56 224a54.28 54.28 0 0 0 38.64-16l11-11a8 8 0 0 0-11.2-11.34" />
        </svg>
        {{ firstAddress }}
      </div>
    </div>
  </div>
</template>
