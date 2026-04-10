<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { formatCount } from '@/lib/utils/formatting'

const props = defineProps<{
  identifier: string | undefined
}>()

const supabase = useSupabaseClient()

let data: Pick<Tables<'discussions'>, 'title' | 'description' | 'reply_count' | 'view_count' | 'created_at'> | null = null

if (props.identifier) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isUuid = uuidRegex.test(props.identifier)

  let query = supabase
    .from('discussions')
    .select('title, description, reply_count, view_count, created_at')

  if (isUuid) {
    query = query.or(`id.eq.${props.identifier},slug.eq.${props.identifier}`)
  }
  else {
    query = query.eq('slug', props.identifier)
  }

  const result = await query.maybeSingle()
  data = result.data
}

const titleFontSize = data?.title && data.title.length > 60 ? 'text-5xl' : 'text-6xl'
const replyCount = data?.reply_count ?? 0
const viewCount = data?.view_count ?? 0
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

    <!-- Forum label -->
    <p class="text-2xl text-[#a7fc2f] m-0 font-semibold tracking-widest uppercase">
      Forum
    </p>

    <!-- Title -->
    <h1
      class="m-0 leading-tight pr-40 shrink-0 text-white"
      :class="titleFontSize"
    >
      {{ data?.title ?? 'Discussion' }}
    </h1>

    <!-- Description -->
    <p
      v-if="data?.description"
      class="text-3xl text-[#aeaeae] m-0 leading-snug pr-40 grow overflow-hidden line-clamp-2"
    >
      {{ data.description }}
    </p>

    <!-- Spacer when no description -->
    <div v-else class="grow" />

    <!-- Meta bar -->
    <div class="flex flex-row gap-12 mt-auto pt-6 border-t border-[#242424]">
      <!-- Reply count -->
      <div v-if="replyCount > 0" class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M216 48H40a16 16 0 0 0-16 16v160a15.85 15.85 0 0 0 9.24 14.5A16.05 16.05 0 0 0 40 240a15.89 15.89 0 0 0 10.25-3.78l.09-.07L82.5 208H216a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16ZM40 224Zm176-32H82.5a16 16 0 0 0-10.3 3.75l-.12.11L40 224V64h176Z" />
        </svg>
        {{ formatCount(replyCount) }} {{ replyCount === 1 ? 'reply' : 'replies' }}
      </div>

      <!-- View count -->
      <div v-if="viewCount > 0" class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M247.31 124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57 61.26 162.88 48 128 48S61.43 61.26 36.34 86.35C17.51 105.18 9 124 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208s66.57-13.26 91.66-38.34c18.83-18.83 27.3-37.61 27.65-38.4a8 8 0 0 0 0-6.5ZM128 192c-30.78 0-57.67-11.19-79.93-33.25A133.47 133.47 0 0 1 25 128a133.33 133.33 0 0 1 23.07-30.75C70.33 75.19 97.22 64 128 64s57.67 11.19 79.93 33.25A133.46 133.46 0 0 1 231.05 128C223.84 141.46 192.43 192 128 192Zm0-112a48 48 0 1 0 48 48a48.05 48.05 0 0 0-48-48Zm0 80a32 32 0 1 1 32-32a32 32 0 0 1-32 32Z" />
        </svg>
        {{ formatCount(viewCount) }} {{ viewCount === 1 ? 'view' : 'views' }}
      </div>
    </div>
  </div>
</template>
