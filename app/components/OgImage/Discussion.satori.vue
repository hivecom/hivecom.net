<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'

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
</script>

<template>
  <div
    :style="{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#111',
      color: '#fff',
      fontFamily: 'Inter',
      padding: '48px 64px',
      gap: '16px',
      position: 'relative',
    }"
  >
    <!-- Background light leak -->
    <img
      src="/leak.png"
      alt=""
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: 0.3,
        mixBlendMode: 'screen',
      }"
    >

    <!-- Logo -->
    <img
      src="/icon.svg"
      alt="Hivecom"
      width="72"
      height="72"
      :style="{
        position: 'absolute',
        top: '48px',
        right: '64px',
      }"
    >

    <!-- Forum label -->
    <p
      :style="{
        fontSize: '24px',
        color: '#a7fc2f',
        margin: 0,
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }"
    >
      Forum
    </p>

    <!-- Title -->
    <h1
      :style="{
        fontSize: data && data.title && data.title.length > 60 ? '48px' : '64px',
        color: '#ffffff',
        margin: 0,
        lineHeight: 1.1,
        paddingRight: '160px',
        flex: '0 0 auto',
      }"
    >
      {{ data?.title ?? 'Discussion' }}
    </h1>

    <!-- Description -->
    <p
      v-if="data?.description"
      :style="{
        fontSize: '32px',
        color: '#aeaeae',
        margin: 0,
        lineHeight: 1.4,
        paddingRight: '160px',
        flex: '1 1 auto',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }"
    >
      {{ data.description }}
    </p>

    <!-- Meta bar -->
    <div
      :style="{
        display: 'flex',
        flexDirection: 'row',
        gap: '48px',
        marginTop: 'auto',
        paddingTop: '24px',
        borderTop: '1px solid #242424',
      }"
    >
      <!-- Reply count -->
      <div
        :style="{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '12px',
          fontSize: '28px',
          color: '#aeaeae',
        }"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256" :style="{ color: '#a7fc2f' }">
          <path fill="currentColor" d="M216 48H40a16 16 0 0 0-16 16v160a15.85 15.85 0 0 0 9.24 14.5A16.05 16.05 0 0 0 40 240a15.89 15.89 0 0 0 10.25-3.78l.09-.07L82.5 208H216a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16ZM40 224Zm176-32H82.5a16 16 0 0 0-10.3 3.75l-.12.11L40 224V64h176Z" />
        </svg>
        {{ data?.reply_count ?? 0 }} {{ (data?.reply_count ?? 0) === 1 ? 'reply' : 'replies' }}
      </div>

      <!-- View count -->
      <div
        :style="{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '12px',
          fontSize: '28px',
          color: '#aeaeae',
        }"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256" :style="{ color: '#a7fc2f' }">
          <path fill="currentColor" d="M247.31 124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57 61.26 162.88 48 128 48S61.43 61.26 36.34 86.35C17.51 105.18 9 124 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208s66.57-13.26 91.66-38.34c18.83-18.83 27.3-37.61 27.65-38.4a8 8 0 0 0 0-6.5ZM128 192c-30.78 0-57.67-11.19-79.93-33.25A133.47 133.47 0 0 1 25 128a133.33 133.33 0 0 1 23.07-30.75C70.33 75.19 97.22 64 128 64s57.67 11.19 79.93 33.25A133.46 133.46 0 0 1 231.05 128C223.84 141.46 192.43 192 128 192Zm0-112a48 48 0 1 0 48 48a48.05 48.05 0 0 0-48-48Zm0 80a32 32 0 1 1 32-32a32 32 0 0 1-32 32Z" />
        </svg>
        {{ data?.view_count ?? 0 }} {{ (data?.view_count ?? 0) === 1 ? 'view' : 'views' }}
      </div>
    </div>
  </div>
</template>
