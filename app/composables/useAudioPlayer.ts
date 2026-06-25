import type { Component } from 'vue'
import { pushToast, removeToast } from '@dolanske/vui'

import ToastBodyAudioPlayer from '@/components/Toast/ToastBodyAudioPlayer.vue'

// The whole point of this composable: playback has to survive page navigation
// and list re-renders. A `new Audio()` element lives in JS, never in the DOM,
// so nothing can unmount it. Every visible player (the inline AudioPlayer
// instances and the persistent toast) is just a view bound to this one engine,
// which is why they can never drift out of sync.

export interface AudioTrack {
  src: string
  title?: string
  subtitle?: string
}

// Module-level singletons. Shared across every caller for the page session.
const currentSrc = ref<string | null>(null)
const title = ref<string | undefined>()
const subtitle = ref<string | undefined>()
const playing = ref(false)
const duration = ref(0)
const currentTime = ref(0)
const loading = ref(false)
const errored = ref(false)
// Held true while a scrubber is being dragged so timeupdate doesn't yank the
// thumb back mid-drag. Shared, so dragging one surface holds them all.
const seeking = ref(false)
const activeToastId = ref<number | null>(null)

let audio: HTMLAudioElement | null = null

// Lazily build the element and wire its listeners once, on first play. Returns
// null on the server where there's no Audio constructor.
function ensureAudio(): HTMLAudioElement | null {
  if (audio || !import.meta.client)
    return audio

  const el = new Audio()
  el.preload = 'metadata'
  el.addEventListener('loadedmetadata', () => {
    duration.value = el.duration
    loading.value = false
  })
  el.addEventListener('timeupdate', () => {
    if (!seeking.value)
      currentTime.value = el.currentTime
  })
  el.addEventListener('play', () => {
    playing.value = true
  })
  el.addEventListener('pause', () => {
    playing.value = false
  })
  el.addEventListener('ended', () => {
    playing.value = false
  })
  el.addEventListener('waiting', () => {
    loading.value = true
  })
  el.addEventListener('playing', () => {
    loading.value = false
  })
  el.addEventListener('error', () => {
    errored.value = true
    loading.value = false
  })

  audio = el
  return audio
}

// Pop the persistent mini-player once. It reads this same state directly, so it
// needs no props beyond the toastId the container injects.
function ensureToast() {
  if (activeToastId.value != null)
    return
  const toast = pushToast('', {
    persist: true,
    body: ToastBodyAudioPlayer as Component,
    bodyProps: {},
  })
  activeToastId.value = toast.id
}

// Pause and wipe state without touching the toast. Used both by stop() and when
// the toast is closed out from under us.
function reset() {
  audio?.pause()
  playing.value = false
  currentSrc.value = null
  currentTime.value = 0
  duration.value = 0
  loading.value = false
  errored.value = false
}

// Start (or restart) a track and surface the toast. Resuming the track that's
// already loaded just plays, it doesn't seek back to zero.
function play(track: AudioTrack) {
  const el = ensureAudio()
  if (!el)
    return

  if (currentSrc.value !== track.src) {
    currentSrc.value = track.src
    title.value = track.title
    subtitle.value = track.subtitle
    duration.value = 0
    currentTime.value = 0
    errored.value = false
    loading.value = true
    el.src = track.src
  }

  el.play().catch(() => {
    errored.value = true
  })
  ensureToast()
}

// Inline players call this: pause/resume if it's the active track, otherwise
// switch to it.
function toggle(track: AudioTrack) {
  if (currentSrc.value === track.src && audio) {
    if (audio.paused) {
      audio.play().catch(() => {
        errored.value = true
      })
    }
    else {
      audio.pause()
    }
  }
  else {
    play(track)
  }
}

// The toast already knows it's on the active track, so it just flips play/pause.
function togglePlayback() {
  if (!audio)
    return
  if (audio.paused) {
    audio.play().catch(() => {
      errored.value = true
    })
  }
  else {
    audio.pause()
  }
}

// Apply a committed seek to the engine.
function commitSeek() {
  if (audio)
    audio.currentTime = currentTime.value
  seeking.value = false
}

// Full stop: reset playback and dismiss the toast.
function stop() {
  reset()
  if (activeToastId.value != null) {
    removeToast(activeToastId.value)
    activeToastId.value = null
  }
}

// Called from the toast body's onUnmounted with its own toast id. Only act when
// it's still the active toast, so a stale unmount (stop then a quick replay that
// already spun up a new toast) can't tear the new one down.
function handleToastUnmount(id: number) {
  if (activeToastId.value !== id)
    return
  activeToastId.value = null
  reset()
}

export function useAudioPlayer() {
  return {
    currentSrc,
    title,
    subtitle,
    playing,
    duration,
    currentTime,
    loading,
    errored,
    seeking,
    play,
    toggle,
    togglePlayback,
    commitSeek,
    stop,
    handleToastUnmount,
  }
}
