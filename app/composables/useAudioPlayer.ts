import type { Component, Ref } from 'vue'
import type { AudioTags } from '@/lib/audio/tags'

import { pushToast, removeToast } from '@dolanske/vui'
import ToastBodyAudioPlayer from '@/components/Toast/ToastBodyAudioPlayer.vue'
import { clearDecodeCache } from '@/lib/audio/decode'
import { prewarmAudioVisuals } from '@/lib/audio/prewarm'
import { readTags } from '@/lib/audio/tags'
import { useMobileViewport } from '@/lib/mediaQuery'

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
// Embedded metadata for the active track (title/artist/album/cover), populated
// async off the shared fetch. Null until a read resolves or when a track has no
// readable tags, so the UI falls back to the passed title/subtitle.
const tags = ref<AudioTags | null>(null)
const playing = ref(false)
const duration = ref(0)
const currentTime = ref(0)
const loading = ref(false)
const errored = ref(false)
// Held true while a scrubber is being dragged so timeupdate doesn't yank the
// thumb back mid-drag. Shared, so dragging one surface holds them all.
const seeking = ref(false)
const activeToastId = ref<number | null>(null)
// Whether the fullscreen spectrogram view is open. Shared so any inline player
// can pop it and the single global AudioLightbox can render the active track.
const fullscreen = ref(false)
// Output level (0..1) and mute, shared so the fullscreen volume control drives
// the one engine. Seeded at the 50% default; the persisted user setting takes
// over once linkVolumeSetting runs on the client.
const volume = ref(0.5)
const muted = ref(false)

let audio: HTMLAudioElement | null = null

// The cover object URL currently held by `tags`, tracked module-side so we can
// revoke it before the next one replaces it. Object URLs live until revoked, so
// without this the blobs pile up on every track change.
let lastCoverUrl: string | null = null

// Swap the tag state and revoke the previous cover URL so its blob is freed.
// The one bit of real cleanup in here: everything else is plain refs.
function setTags(next: AudioTags | null) {
  if (lastCoverUrl)
    URL.revokeObjectURL(lastCoverUrl)
  lastCoverUrl = next?.cover ?? null
  tags.value = next
}

// Captured once the volume setting is linked, so setVolume can persist back to
// it. Null on the server and until the first client mount.
let userSettings: Ref<{ audio_player_volume: number }> | null = null
let isMobileViewport: Ref<boolean> | null = null
let volumeLinked = false

// Link the engine's output level to the persisted `audio_player_volume` user
// setting (stored 0-100, DB-synced for members and localStorage for guests).
// Desktop output mirrors the setting both ways; mobile is pinned to full so the
// device volume is the only control. Registered once, on the client.
function linkVolumeSetting() {
  if (!import.meta.client || volumeLinked)
    return
  volumeLinked = true

  const { settings } = useDataUserSettings()
  userSettings = settings
  isMobileViewport = useMobileViewport()

  // Push the setting onto the engine now and whenever it or the viewport changes
  // (a login swaps the whole settings object in).
  watch(
    [() => settings.value.audio_player_volume, isMobileViewport],
    ([stored, mobile]) => {
      volume.value = mobile ? 1 : Math.max(0, Math.min(1, (stored ?? 50) / 100))
      if (mobile)
        muted.value = false
      applyVolume()
    },
    { immediate: true },
  )
}

// Push the current level/mute onto the live element. Safe to call before the
// element exists.
function applyVolume() {
  if (!audio)
    return
  audio.volume = volume.value
  audio.muted = muted.value
}

// Lazily build the element and wire its listeners once, on first play. Returns
// null on the server where there's no Audio constructor.
function ensureAudio(): HTMLAudioElement | null {
  if (audio || !import.meta.client)
    return audio

  const el = new Audio()
  el.preload = 'metadata'
  el.volume = volume.value
  el.muted = muted.value
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
  // Player's closed, drop the held decoded buffer so its PCM can be collected
  // and revoke the cover URL so its blob is freed.
  clearDecodeCache()
  setTags(null)
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
    // Warm the fullscreen visuals while the user listens, so expanding is
    // instant. Background, swallows its own errors.
    prewarmAudioVisuals(track.src)
    // Read embedded tags off the same shared fetch. Fire-and-forget; the
    // currentSrc guard mirrors the components' `if (src !== props.src) return`
    // so a slow resolve on an old track can't clobber a newer one.
    setTags(null)
    void readTags(track.src).then((t) => {
      if (currentSrc.value === track.src)
        setTags(t)
    })
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

// Set the output level. Any move off zero clears mute, the way a hardware fader
// would.
function setVolume(value: number) {
  volume.value = Math.max(0, Math.min(1, value))
  if (volume.value > 0)
    muted.value = false
  applyVolume()
  // Persist as the shared user setting (0-100) on desktop. Mobile output is
  // pinned to full, so there's nothing worth saving there. The setting watcher
  // echoes the value back onto `volume`, which is a harmless no-op.
  if (userSettings && isMobileViewport && !isMobileViewport.value)
    userSettings.value.audio_player_volume = Math.round(volume.value * 100)
}

function toggleMute() {
  muted.value = !muted.value
  applyVolume()
}

// Open the fullscreen spectrogram view on a track. Hands the track to the
// engine if it isn't already active (so the playhead has something to follow);
// resuming an already-active paused track is left to the user.
function openFullscreen(track: AudioTrack) {
  if (currentSrc.value !== track.src)
    play(track)
  else
    ensureToast()
  fullscreen.value = true
}

function closeFullscreen() {
  fullscreen.value = false
}

// Full stop: reset playback and dismiss the toast.
function stop() {
  reset()
  fullscreen.value = false
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
  // Wire the shared volume to the persisted setting on first client use. Guarded
  // so it only registers once across every player that calls this.
  linkVolumeSetting()

  return {
    currentSrc,
    title,
    subtitle,
    tags,
    playing,
    duration,
    currentTime,
    loading,
    errored,
    seeking,
    fullscreen,
    volume,
    muted,
    play,
    toggle,
    togglePlayback,
    commitSeek,
    setVolume,
    toggleMute,
    openFullscreen,
    closeFullscreen,
    stop,
    handleToastUnmount,
  }
}
