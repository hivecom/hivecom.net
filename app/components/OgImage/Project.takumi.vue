<script setup lang="ts">
const props = defineProps<{
  projectId: number
}>()

const supabase = useSupabaseClient()

const { data } = await supabase
  .from('projects')
  .select('title, description, tags, github, link, owner:profiles(username)')
  .eq('id', props.projectId)
  .single()

const titleFontSize = data?.title && data.title.length > 60 ? 'text-5xl' : 'text-6xl'

const tags = data?.tags && data.tags.length > 0 ? data.tags.slice(0, 4) : null

const owner = data?.owner
const ownerUsername = Array.isArray(owner)
  ? (owner[0]?.username ?? null)
  : (owner?.username ?? null)

const githubRepo = data?.github ?? null
const externalLink = !githubRepo && data?.link ? data.link : null
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
      Project
    </p>

    <!-- Title -->
    <h1
      class="m-0 leading-tight pr-40 shrink-0 text-white"
      :class="titleFontSize"
    >
      {{ data?.title ?? 'Project' }}
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

    <!-- Tags -->
    <div
      v-if="tags"
      class="flex flex-row gap-2 flex-wrap"
    >
      <span
        v-for="tag in tags"
        :key="tag"
        class="inline-block px-3 py-1 text-xl rounded-full border border-[#242424] text-[#aeaeae]"
      >
        {{ tag }}
      </span>
    </div>

    <!-- Meta bar -->
    <div class="flex flex-row gap-16 mt-auto pt-6 border-t border-[#242424]">
      <!-- Owner -->
      <div
        v-if="ownerUsername"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M230.9 212a120.8 120.8 0 0 0-67.1-54.2a72 72 0 1 0-73.6 0A120.8 120.8 0 0 0 25.1 212a8 8 0 1 0 13.8 8a104 104 0 0 1 180.2 0a8 8 0 1 0 13.8-8ZM72 96a56 56 0 1 1 56 56a56.1 56.1 0 0 1-56-56Z" />
        </svg>
        @{{ ownerUsername }}
      </div>

      <!-- GitHub repo -->
      <div
        v-if="githubRepo"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 24 24"
        >
          <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z" />
        </svg>
        {{ githubRepo }}
      </div>

      <!-- External link (only when no GitHub) -->
      <div
        v-else-if="externalLink"
        class="flex flex-row items-center gap-3 text-[28px] text-[#aeaeae]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-8 h-8 text-[#a7fc2f] shrink-0"
          viewBox="0 0 256 256"
        >
          <path fill="currentColor" d="M224 104a8 8 0 0 1-16 0V59.3l-82.3 82.4a8.1 8.1 0 0 1-11.4 0a8 8 0 0 1 0-11.4L196.7 48H152a8 8 0 0 1 0-16h64a8 8 0 0 1 8 8Zm-40 24a8 8 0 0 0-8 8v72H48V80h72a8 8 0 0 0 0-16H48a16 16 0 0 0-16 16v128a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V136a8 8 0 0 0-8-8Z" />
        </svg>
        Website
      </div>
    </div>
  </div>
</template>
