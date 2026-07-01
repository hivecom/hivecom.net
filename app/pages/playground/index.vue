<script setup lang="ts">
import { Button, Dropzone, Flex, pushToast } from '@dolanske/vui'
import { ref } from 'vue'

// Visualizer playground: drop a local audio file and it opens in the fullscreen
// lightbox (the smoke visualizer, spectrum and waveform) so the visuals can be
// tried against real tracks without uploading anything. The file never leaves
// the browser, it's handed to the shared player as a blob: URL.

const player = useAudioPlayer()

const currentName = ref<string | null>(null)
let objectUrl: string | null = null

function openFile(file: File) {
  if (!file.type.startsWith('audio/')) {
    pushToast('Not an audio file', { description: file.name })
    return
  }
  // Drop the previous local URL so it doesn't leak when swapping tracks.
  if (objectUrl)
    URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  currentName.value = file.name
  player.openFullscreen({ src: objectUrl, title: file.name, subtitle: 'Local file' })
}

function onFiles(files: FileList) {
  const file = files[0]
  if (file)
    openFile(file)
}

function reopen() {
  if (objectUrl && currentName.value)
    player.openFullscreen({ src: objectUrl, title: currentName.value, subtitle: 'Local file' })
}
</script>

<template>
  <div class="page container-s">
    <Flex column gap="l" expand>
      <h1>Visualizer playground</h1>

      <p>Drop an audio file to open it in the fullscreen player. Everything runs locally, nothing is uploaded.</p>

      <Flex expand>
        <Dropzone
          accept="audio/*"
          label="Drop an audio file"
          hint="mp3, wav, flac, ogg, ..."
          expand
          @files="onFiles"
        />
      </Flex>

      <Flex v-if="currentName" gap="s" y-center wrap>
        <span class="text-color-light">{{ currentName }}</span>
        <Button size="s" variant="gray" @click="reopen">
          Reopen player
        </Button>
      </Flex>
    </Flex>
  </div>
</template>
