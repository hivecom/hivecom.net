<script setup lang="ts">
import { Button, Flex, Modal } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { CircleStencil, Cropper, RectangleStencil } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

interface Props {
  open: boolean
  imageSrc: string
  imageMime: string
  /** Use circular stencil (avatar variant) */
  circular?: boolean
  /** Lock aspect ratio. If not set, free crop. */
  aspectRatio?: number
  /** Output image max dimension in pixels */
  outputSize?: number
}

const props = withDefaults(defineProps<Props>(), {
  circular: false,
  outputSize: 1024,
})

const emit = defineEmits<{
  confirm: [file: File]
  cancel: []
}>()

const cropperRef = ref<InstanceType<typeof Cropper> | null>(null)
const applying = ref(false)

const stencilComponent = computed(() => props.circular ? CircleStencil : RectangleStencil)

const stencilProps = computed(() => {
  if (props.circular)
    return { aspectRatio: 1 }
  if (props.aspectRatio)
    return { aspectRatio: props.aspectRatio }
  return {}
})

async function handleConfirm() {
  if (!cropperRef.value)
    return

  applying.value = true

  try {
    const { canvas } = cropperRef.value.getResult()
    if (!canvas)
      return

    // Determine output dimensions - cap at outputSize while preserving aspect
    let { width, height } = canvas
    const max = props.outputSize
    if (width > max || height > max) {
      if (width >= height) {
        height = Math.round((height / width) * max)
        width = max
      }
      else {
        width = Math.round((width / height) * max)
        height = max
      }
    }

    const offscreen = document.createElement('canvas')
    offscreen.width = width
    offscreen.height = height
    const ctx = offscreen.getContext('2d')
    if (!ctx)
      return

    ctx.drawImage(canvas, 0, 0, width, height)

    // Use webp for static images, keep original mime for others
    const outputMime = props.imageMime === 'image/png' ? 'image/png' : 'image/webp'
    const quality = outputMime === 'image/webp' ? 0.92 : undefined

    const blob = await new Promise<Blob | null>(resolve =>
      offscreen.toBlob(resolve, outputMime, quality),
    )

    if (!blob)
      return

    const ext = outputMime === 'image/png' ? 'png' : 'webp'
    const file = new File([blob], `cropped.${ext}`, { type: outputMime })
    emit('confirm', file)
  }
  finally {
    applying.value = false
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <Modal size="l" :open="open" @close="handleCancel">
    <template #header>
      <h4>Crop image</h4>
    </template>

    <div class="crop-modal__body">
      <Cropper
        ref="cropperRef"
        class="crop-modal__cropper"
        :src="imageSrc"
        :stencil-component="stencilComponent"
        :stencil-props="stencilProps"
        background-class="crop-modal__bg"
        image-restriction="fit-area"
      />
    </div>

    <template #footer>
      <Flex gap="s" x-end>
        <Button variant="gray" :disabled="applying" @click="handleCancel">
          Cancel
        </Button>
        <Button variant="accent" :loading="applying" @click="handleConfirm">
          Apply crop
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.crop-modal {
  &__body {
    width: 100%;
    // Fixed height so the cropper has a defined bounding box
    height: 480px;
    background: var(--color-bg-lowered);
    border-radius: var(--border-radius-m);
    overflow: hidden;
  }

  &__cropper {
    width: 100%;
    height: 100%;
  }

  // Override vue-advanced-cropper background to match theme
  &__bg {
    background: var(--color-bg-lowered);
  }
}
</style>

<style lang="scss">
// Unscoped - target vue-advanced-cropper internals
.vue-advanced-cropper {
  &__background,
  &__foreground {
    background: var(--color-bg-lowered);
  }

  &__foreground {
    opacity: 0.75;
  }
}

.vue-rectangle-stencil__line,
.vue-circle-stencil__line {
  border-color: var(--color-text);
}

.vue-simple-handler {
  background: var(--dark-color-accent);
  box-shadow: var(--box-shadow);
}

.vue-simple-line {
  background: none;
  // Setting white for both light & dark mode. Accent on light mode is very hard
  // to read and I don't want themes tp override this
  border-color: var(--color-text);
  border-style: dashed;
}
</style>
