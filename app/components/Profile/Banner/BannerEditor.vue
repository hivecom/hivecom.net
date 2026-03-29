<script setup lang="ts">
/**
 * BannerEditor - A canvas-based editor for creating user forum banners.
 *
 * Banners are horizontal images (728×48) stored as WebP. The editor supports:
 * - Background: solid colour or linear gradient
 * - Multiple text layers with independent font/colour/position
 * - Multiple image layers with drag-to-move and corner-handle resize
 *
 * Editor metadata is serialised as JSON and embedded as a trailing text chunk
 * in the WebP file so the editor state can be restored when re-editing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { Button, Divider, Flex, Input, Modal, Select, Tooltip } from '@dolanske/vui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { validateImageFile } from '@/lib/storage'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TextLayer {
  id: string
  type: 'text'
  content: string
  fontFamily: string
  /** Capped between TEXT_FONT_SIZE_MIN and TEXT_FONT_SIZE_MAX */
  fontSize: number
  color: string
  x: number
  y: number
  bold: boolean
  italic: boolean
}

export interface ImageAssetMeta {
  originalName: string
  size: number | null
  type: string | null
  lastModified: number | null
}

export interface ImageLayer {
  id: string
  type: 'image'
  /** Object URL for local preview; empty string when restored from metadata */
  src: string
  /** Raw file when freshly added; null when restored from metadata */
  file: File | null
  assetMeta: ImageAssetMeta
  x: number
  y: number
  width: number
  height: number
  /** width / height - preserved during resize */
  aspect: number
}

export type BannerLayer = TextLayer | ImageLayer

export interface MetadataTextLayer {
  id: string
  type: 'text'
  content: string
  fontFamily: string
  fontSize: number
  color: string
  x: number
  y: number
  bold: boolean
  italic: boolean
}

export interface MetadataImageLayer {
  id: string
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  aspect: number
  asset?: ImageAssetMeta
  originalName?: string
}

export type MetadataLayer = MetadataTextLayer | MetadataImageLayer

export interface BannerMetadata {
  version: 2 | 3
  background: {
    type: 'solid' | 'gradient'
    color: string
    gradientEnd: string
    gradientAngle: number
  }
  layers: MetadataLayer[]
}

// ── Props / Emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  /** Current user ID for storage paths */
  userId: string | null
  /** Whether the editor modal is open */
  open: boolean
}>()

const emit = defineEmits<{
  saved: [url: string]
  deleted: []
  close: []
}>()

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNER_WIDTH = 728
const BANNER_HEIGHT = 48
const WORKSPACE_PADDING = 40
const WORKSPACE_WIDTH = BANNER_WIDTH + WORKSPACE_PADDING * 2
const WORKSPACE_HEIGHT = BANNER_HEIGHT + WORKSPACE_PADDING * 2
const METADATA_MARKER = '<!-- HIVECOM_BANNER_META:'
const METADATA_END = ':END -->'
const TEXT_FONT_SIZE_MIN = 8
const TEXT_FONT_SIZE_MAX = 32

interface SelectOption<T extends string = string> {
  label: string
  value: T
}

const BG_TYPE_OPTIONS: SelectOption<'solid' | 'gradient'>[] = [
  { label: 'Solid', value: 'solid' },
  { label: 'Gradient', value: 'gradient' },
]

const FONT_OPTIONS: SelectOption[] = [
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Cursive', value: 'cursive' },
]

// ── State ─────────────────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingReplaceLayerId = ref<string | null>(null)

const saving = ref(false)
const saveError = ref<string | null>(null)
const loading = ref(false)

// Background
const bgType = ref<'solid' | 'gradient'>('solid')
const bgColor = ref('#1a1a2e')
const bgGradientEnd = ref('#16213e')
const bgGradientAngle = ref(90)

// Unified layer array
const layers = ref<BannerLayer[]>([])

// Selection
const selectedLayerId = ref<string | null>(null)
const selectedLayer = computed(() => layers.value.find(l => l.id === selectedLayerId.value) ?? null)
const selectedTextLayer = computed<TextLayer | null>(() =>
  selectedLayer.value?.type === 'text' ? (selectedLayer.value as TextLayer) : null,
)
const selectedImageLayer = computed<ImageLayer | null>(() =>
  selectedLayer.value?.type === 'image' ? (selectedLayer.value as ImageLayer) : null,
)

const bgTypeModel = computed<SelectOption<'solid' | 'gradient'>[] | undefined>({
  get() {
    const match = BG_TYPE_OPTIONS.find(option => option.value === bgType.value)
    return match ? [match] : undefined
  },
  set(selection) {
    bgType.value = selection?.[0]?.value ?? 'solid'
  },
})

const fontFamilyModel = computed<SelectOption[] | undefined>({
  get() {
    const layer = selectedTextLayer.value
    if (!layer)
      return undefined
    const match = FONT_OPTIONS.find(option => option.value === layer.fontFamily)
    return match ? [match] : undefined
  },
  set(selection) {
    const layer = selectedTextLayer.value
    if (!layer)
      return
    const next = selection?.[0]?.value
    if (next)
      layer.fontFamily = next
  },
})

// Reversed layer list for UI display (frontmost layer at top of list)
const layersReversed = computed(() => layers.value.toReversed())

// Interaction state
const dragging = ref<'layer' | null>(null)
const draggingLayerId = ref<string | null>(null)
const resizingLayerId = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })
const resizeStartPos = ref({ x: 0, y: 0 })
const resizeStartSize = ref({ width: 0, height: 0 })
const hoveredLayerId = ref<string | null>(null)

// ── Canvas scaling ────────────────────────────────────────────────────────────

const canvasContainerRef = ref<HTMLDivElement | null>(null)
const displayScale = ref(1)

function updateDisplayScale() {
  if (!canvasContainerRef.value)
    return
  const containerWidth = canvasContainerRef.value.clientWidth
  displayScale.value = Math.min(1, containerWidth / WORKSPACE_WIDTH)
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function buildMetadata(): BannerMetadata {
  return {
    version: 3,
    background: {
      type: bgType.value,
      color: bgColor.value,
      gradientEnd: bgGradientEnd.value,
      gradientAngle: bgGradientAngle.value,
    },
    layers: layers.value.map((l) => {
      if (l.type === 'text') {
        return {
          id: l.id,
          type: 'text' as const,
          content: l.content,
          fontFamily: l.fontFamily,
          fontSize: l.fontSize,
          color: l.color,
          x: l.x,
          y: l.y,
          bold: l.bold,
          italic: l.italic,
        }
      }
      return {
        id: l.id,
        type: 'image' as const,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
        aspect: l.aspect,
        asset: l.assetMeta ?? {
          originalName: l.file?.name ?? 'image',
          size: l.file?.size ?? null,
          type: l.file?.type ?? null,
          lastModified: l.file?.lastModified ?? null,
        },
      }
    }),
  }
}

function applyMetadata(meta: BannerMetadata) {
  bgType.value = meta.background.type
  bgColor.value = meta.background.color
  bgGradientEnd.value = meta.background.gradientEnd
  bgGradientAngle.value = meta.background.gradientAngle

  layers.value = meta.layers.map((l): BannerLayer => {
    if (l.type === 'text') {
      return {
        id: l.id,
        type: 'text',
        content: l.content,
        fontFamily: l.fontFamily,
        fontSize: Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, l.fontSize)),
        color: l.color,
        x: l.x,
        y: l.y,
        bold: l.bold,
        italic: l.italic,
      }
    }
    const assetMeta: ImageAssetMeta = l.asset ?? {
      originalName: l.originalName ?? 'image',
      size: null,
      type: null,
      lastModified: null,
    }
    return {
      id: l.id,
      type: 'image',
      // Pixel data cannot be extracted from the composite WebP.
      // The layer renders blank until the image file is re-added.
      src: '',
      file: null,
      assetMeta,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      aspect: l.aspect,
    }
  })
}

// ── Drawing ───────────────────────────────────────────────────────────────────

const loadedImages = new Map<string, HTMLImageElement>()

function getOrLoadImage(src: string): HTMLImageElement | null {
  if (!src)
    return null
  const existing = loadedImages.get(src)
  if (existing?.complete)
    return existing
  if (existing)
    return null
  const img = new Image()
  img.onload = () => redraw()
  img.src = src
  loadedImages.set(src, img)
  return img.complete ? img : null
}

function buildFontStyle(layer: TextLayer): string {
  return [
    layer.italic ? 'italic' : '',
    layer.bold ? 'bold' : '',
    `${layer.fontSize}px`,
    layer.fontFamily,
  ].filter(Boolean).join(' ')
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  if (bgType.value === 'gradient') {
    const angleRad = (bgGradientAngle.value * Math.PI) / 180
    const cx = BANNER_WIDTH / 2
    const cy = BANNER_HEIGHT / 2
    const len = Math.max(BANNER_WIDTH, BANNER_HEIGHT)
    const dx = Math.cos(angleRad) * len
    const dy = Math.sin(angleRad) * len
    const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    grad.addColorStop(0, bgColor.value)
    grad.addColorStop(1, bgGradientEnd.value)
    ctx.fillStyle = grad
  }
  else {
    ctx.fillStyle = bgColor.value
  }
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT)
}

function redraw() {
  const canvas = canvasRef.value
  if (!canvas)
    return
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, WORKSPACE_WIDTH, WORKSPACE_HEIGHT)

  // Render banner content (clipped to export bounds)
  ctx.save()
  ctx.translate(WORKSPACE_PADDING, WORKSPACE_PADDING)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, BANNER_WIDTH, BANNER_HEIGHT)
  ctx.clip()

  drawBackground(ctx)

  // Draw each layer in array order (index 0 = backmost, last = frontmost)
  for (const layer of layers.value) {
    if (layer.type === 'image') {
      if (!layer.src)
        continue
      const img = getOrLoadImage(layer.src)
      if (img)
        ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height)
    }
    else if (layer.type === 'text') {
      if (!layer.content.trim())
        continue
      ctx.font = buildFontStyle(layer)
      ctx.fillStyle = layer.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 4
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 1
      ctx.fillText(layer.content, layer.x, layer.y)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }
  }

  ctx.restore()
  ctx.restore()

  // Render guides outside banner bounds
  ctx.save()
  ctx.translate(WORKSPACE_PADDING, WORKSPACE_PADDING)
  drawSelectionIndicators(ctx)
  drawBannerBoundary(ctx)
  ctx.restore()
}

function drawSelectionIndicators(ctx: CanvasRenderingContext2D) {
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1

  for (const layer of layers.value) {
    const isSelected = layer.id === selectedLayerId.value
    const isHovered = layer.id === hoveredLayerId.value
    if (!isSelected && !isHovered)
      continue

    if (layer.type === 'text') {
      if (!layer.content.trim())
        continue
      ctx.font = buildFontStyle(layer)
      const metrics = ctx.measureText(layer.content)
      const tw = metrics.width
      const th = layer.fontSize
      ctx.strokeStyle = isSelected ? '#4fc3f7' : 'rgba(255,255,255,0.5)'
      ctx.strokeRect(layer.x - tw / 2 - 4, layer.y - th / 2 - 4, tw + 8, th + 8)
    }
    else if (layer.type === 'image') {
      ctx.strokeStyle = isSelected ? '#4fc3f7' : 'rgba(255,255,255,0.5)'
      ctx.strokeRect(layer.x - 1, layer.y - 1, layer.width + 2, layer.height + 2)
      if (isSelected) {
        const handleSize = 8
        ctx.setLineDash([])
        ctx.fillStyle = '#4fc3f7'
        ctx.fillRect(
          layer.x + layer.width - handleSize / 2,
          layer.y + layer.height - handleSize / 2,
          handleSize,
          handleSize,
        )
        ctx.setLineDash([4, 4])
      }
    }
  }

  ctx.setLineDash([])
}

function drawBannerBoundary(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.strokeRect(0.5, 0.5, BANNER_WIDTH - 1, BANNER_HEIGHT - 1)
  ctx.restore()
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function canvasToLocal(e: MouseEvent): { x: number, y: number } {
  const canvas = canvasRef.value
  if (!canvas)
    return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = WORKSPACE_WIDTH / rect.width
  const scaleY = WORKSPACE_HEIGHT / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX - WORKSPACE_PADDING,
    y: (e.clientY - rect.top) * scaleY - WORKSPACE_PADDING,
  }
}

function hitTestTextLayer(x: number, y: number, layer: TextLayer): boolean {
  if (!layer.content.trim())
    return false
  const canvas = canvasRef.value
  if (!canvas)
    return false
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return false
  ctx.font = buildFontStyle(layer)
  const metrics = ctx.measureText(layer.content)
  const tw = metrics.width
  const th = layer.fontSize
  const pad = 6
  return (
    x >= layer.x - tw / 2 - pad
    && x <= layer.x + tw / 2 + pad
    && y >= layer.y - th / 2 - pad
    && y <= layer.y + th / 2 + pad
  )
}

function hitTestImageLayer(x: number, y: number, layer: ImageLayer): boolean {
  return x >= layer.x && x <= layer.x + layer.width && y >= layer.y && y <= layer.y + layer.height
}

function hitTestImageResizeHandle(x: number, y: number, layer: ImageLayer): boolean {
  const handleSize = 12
  const hx = layer.x + layer.width
  const hy = layer.y + layer.height
  return x >= hx - handleSize && x <= hx + handleSize && y >= hy - handleSize && y <= hy + handleSize
}

// ── Mouse handlers ────────────────────────────────────────────────────────────

function onCanvasMouseDown(e: MouseEvent) {
  const pos = canvasToLocal(e)

  // Iterate layers in reverse (topmost rendered = last in array, checked first)
  for (let i = layers.value.length - 1; i >= 0; i--) {
    const layer = layers.value[i]
    if (!layer)
      continue

    if (layer.type === 'image') {
      if (selectedLayerId.value === layer.id && hitTestImageResizeHandle(pos.x, pos.y, layer)) {
        resizingLayerId.value = layer.id
        resizeStartPos.value = { x: pos.x, y: pos.y }
        resizeStartSize.value = { width: layer.width, height: layer.height }
        return
      }
      if (hitTestImageLayer(pos.x, pos.y, layer)) {
        dragging.value = 'layer'
        draggingLayerId.value = layer.id
        dragOffset.value = { x: pos.x - layer.x, y: pos.y - layer.y }
        selectedLayerId.value = layer.id
        redraw()
        return
      }
    }
    else if (layer.type === 'text') {
      if (hitTestTextLayer(pos.x, pos.y, layer)) {
        dragging.value = 'layer'
        draggingLayerId.value = layer.id
        dragOffset.value = { x: pos.x - layer.x, y: pos.y - layer.y }
        selectedLayerId.value = layer.id
        redraw()
        return
      }
    }
  }

  // Clicked empty space — deselect
  selectedLayerId.value = null
  redraw()
}

function onCanvasMouseMove(e: MouseEvent) {
  const pos = canvasToLocal(e)

  // Resize
  if (resizingLayerId.value) {
    const layer = layers.value.find(l => l.id === resizingLayerId.value)
    if (!layer || layer.type !== 'image')
      return
    const dx = pos.x - resizeStartPos.value.x
    const newWidth = Math.max(16, resizeStartSize.value.width + dx)
    const newHeight = newWidth / layer.aspect
    layer.width = Math.round(newWidth)
    layer.height = Math.round(newHeight)
    redraw()
    return
  }

  // Drag
  if (dragging.value === 'layer' && draggingLayerId.value) {
    const layer = layers.value.find(l => l.id === draggingLayerId.value)
    if (!layer)
      return
    layer.x = Math.round(pos.x - dragOffset.value.x)
    layer.y = Math.round(pos.y - dragOffset.value.y)
    redraw()
    return
  }

  // Hover detection
  let newHoverId: string | null = null
  for (let i = layers.value.length - 1; i >= 0; i--) {
    const layer = layers.value[i]
    if (!layer)
      continue
    const hit = layer.type === 'image'
      ? hitTestImageLayer(pos.x, pos.y, layer)
      : hitTestTextLayer(pos.x, pos.y, layer)
    if (hit) {
      newHoverId = layer.id
      break
    }
  }

  if (newHoverId !== hoveredLayerId.value) {
    hoveredLayerId.value = newHoverId
    redraw()
  }
}

function onCanvasMouseUp() {
  dragging.value = null
  draggingLayerId.value = null
  resizingLayerId.value = null
}

// ── Layer management ──────────────────────────────────────────────────────────

function addTextLayer() {
  const layer: TextLayer = {
    id: crypto.randomUUID(),
    type: 'text',
    content: 'Text',
    fontFamily: 'sans-serif',
    fontSize: 20,
    color: '#ffffff',
    x: Math.round(BANNER_WIDTH / 2),
    y: Math.round(BANNER_HEIGHT / 2),
    bold: false,
    italic: false,
  }
  layers.value.push(layer)
  selectedLayerId.value = layer.id
  redraw()
}

function openImagePicker(layerId?: string) {
  pendingReplaceLayerId.value = layerId ?? null
  fileInputRef.value?.click()
}

function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    pendingReplaceLayerId.value = null
    return
  }

  const validation = validateImageFile(file)
  if (!validation.valid) {
    saveError.value = validation.error ?? 'Invalid image file'
    return
  }

  let targetLayerId = pendingReplaceLayerId.value
  pendingReplaceLayerId.value = null

  if (!targetLayerId) {
    const match = layers.value.find((layer) => {
      if (layer.type !== 'image' || layer.src)
        return false
      const meta = layer.assetMeta
      if (!meta)
        return false
      const nameMatches = meta.originalName === file.name
      const sizeMatches = meta.size == null || meta.size === file.size
      const typeMatches = meta.type == null || meta.type === file.type
      const modifiedMatches = meta.lastModified == null || meta.lastModified === file.lastModified
      return nameMatches && sizeMatches && typeMatches && modifiedMatches
    })
    if (match)
      targetLayerId = match.id
  }

  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const aspect = img.width / img.height
    const assetMeta: ImageAssetMeta = {
      originalName: file.name,
      size: file.size,
      type: file.type || null,
      lastModified: file.lastModified ?? null,
    }

    if (targetLayerId) {
      const existing = layers.value.find(l => l.id === targetLayerId)
      if (existing && existing.type === 'image') {
        if (existing.src && existing.src.startsWith('blob:')) {
          URL.revokeObjectURL(existing.src)
          loadedImages.delete(existing.src)
        }

        const { width, height, aspect: storedAspect } = existing

        existing.src = url
        existing.file = file
        existing.assetMeta = assetMeta
        existing.width = width
        existing.height = height
        existing.aspect = storedAspect
        selectedLayerId.value = existing.id
        redraw()
        return
      }
    }

    const height = Math.min(BANNER_HEIGHT - 4, img.height)
    const width = Math.round(height * aspect)
    const layer: ImageLayer = {
      id: crypto.randomUUID(),
      type: 'image',
      src: url,
      file,
      assetMeta,
      x: Math.round((BANNER_WIDTH - width) / 2),
      y: Math.round((BANNER_HEIGHT - height) / 2),
      width,
      height,
      aspect,
    }
    layers.value.push(layer)
    selectedLayerId.value = layer.id
    redraw()
  }
  img.src = url
  // Allow the same file to be selected again
  input.value = ''
}

function removeLayer(id: string) {
  const idx = layers.value.findIndex(l => l.id === id)
  if (idx === -1)
    return
  const layer = layers.value[idx]
  if (layer?.type === 'image' && layer.src.startsWith('blob:')) {
    URL.revokeObjectURL(layer.src)
    loadedImages.delete(layer.src)
  }
  layers.value.splice(idx, 1)
  if (selectedLayerId.value === id)
    selectedLayerId.value = null
  redraw()
}

function removeSelectedLayer() {
  if (selectedLayerId.value)
    removeLayer(selectedLayerId.value)
}

/** Move layer toward front (higher z-order = higher index in array). */
function moveLayerUp(id: string) {
  const idx = layers.value.findIndex(l => l.id === id)
  if (idx < layers.value.length - 1) {
    const [moved] = layers.value.splice(idx, 1)
    if (moved)
      layers.value.splice(idx + 1, 0, moved)
    redraw()
  }
}

/** Move layer toward back (lower z-order = lower index in array). */
function moveLayerDown(id: string) {
  const idx = layers.value.findIndex(l => l.id === id)
  if (idx > 0) {
    const [moved] = layers.value.splice(idx, 1)
    if (moved)
      layers.value.splice(idx - 1, 0, moved)
    redraw()
  }
}

// ── Export ─────────────────────────────────────────────────────────────────────

async function exportToWebPBlob(): Promise<Blob> {
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = BANNER_WIDTH
  exportCanvas.height = BANNER_HEIGHT
  const ctx = exportCanvas.getContext('2d')
  if (!ctx)
    throw new Error('Could not get canvas context')

  drawBackground(ctx)

  for (const layer of layers.value) {
    if (layer.type === 'image') {
      if (!layer.src)
        continue
      const img = loadedImages.get(layer.src)
      if (!img?.complete)
        continue

      // Downsample oversized source images to avoid memory bloat
      let source: CanvasImageSource = img
      if (img.naturalWidth > layer.width * 2 || img.naturalHeight > layer.height * 2) {
        const tmp = document.createElement('canvas')
        tmp.width = layer.width
        tmp.height = layer.height
        const tmpCtx = tmp.getContext('2d')
        if (tmpCtx) {
          tmpCtx.drawImage(img, 0, 0, layer.width, layer.height)
          source = tmp
        }
      }
      ctx.drawImage(source, layer.x, layer.y, layer.width, layer.height)
    }
    else if (layer.type === 'text') {
      if (!layer.content.trim())
        continue
      ctx.font = buildFontStyle(layer)
      ctx.fillStyle = layer.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 4
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 1
      ctx.fillText(layer.content, layer.x, layer.y)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }
  }

  // Quality loop: start at 0.85, reduce by 0.1 if > 900 KB, floor at 0.3
  const toBlob = (quality: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      exportCanvas.toBlob(
        (blob) => {
          if (!blob)
            reject(new Error('Failed to export canvas as WebP'))
          else
            resolve(blob)
        },
        'image/webp',
        quality,
      )
    })

  let quality = 0.85
  let imageBlob: Blob | null = null
  while (quality >= 0.3) {
    const blob = await toBlob(quality)
    if (blob.size <= 900_000 || quality <= 0.3) {
      imageBlob = blob
      break
    }
    quality = Math.round((quality - 0.1) * 10) / 10
  }
  if (!imageBlob)
    throw new Error('Failed to export canvas as WebP')

  // Embed metadata as a trailing text chunk
  const meta = buildMetadata()
  const metaString = METADATA_MARKER + JSON.stringify(meta) + METADATA_END
  const metaBytes = new TextEncoder().encode(metaString)
  return new Blob([imageBlob, metaBytes], { type: 'image/webp' })
}

// ── Load existing banner ──────────────────────────────────────────────────────

async function loadExistingBanner(supabase: SupabaseClient<Database>, userId: string) {
  loading.value = true
  try {
    const { data: files, error: listError } = await supabase.storage
      .from(USERS_BUCKET_ID)
      .list(userId, { search: 'banner.webp' })

    if (listError || !files || files.length === 0)
      return

    const { data: urlData } = supabase.storage
      .from(USERS_BUCKET_ID)
      .getPublicUrl(`${userId}/banner.webp`)

    if (!urlData?.publicUrl)
      return

    const response = await fetch(`${urlData.publicUrl}?t=${Date.now()}`)
    const arrayBuffer = await response.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const text = new TextDecoder().decode(bytes)

    const markerIndex = text.lastIndexOf(METADATA_MARKER)
    if (markerIndex >= 0) {
      const endIndex = text.indexOf(METADATA_END, markerIndex)
      if (endIndex >= 0) {
        const jsonStr = text.substring(markerIndex + METADATA_MARKER.length, endIndex)
        try {
          const meta = JSON.parse(jsonStr) as BannerMetadata
          applyMetadata(meta)
        }
        catch {
          // Corrupted metadata — start fresh
        }
      }
    }

    await nextTick()
    redraw()
  }
  catch {
    // Could not load existing banner — start fresh
  }
  finally {
    loading.value = false
  }
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

async function saveBanner() {
  if (!props.userId) {
    saveError.value = 'You must be signed in to save a banner'
    return
  }

  saving.value = true
  saveError.value = null

  try {
    const supabase = useSupabaseClient<Database>()
    const blob = await exportToWebPBlob()
    const file = new File([blob], 'banner.webp', { type: 'image/webp', lastModified: Date.now() })
    const filePath = `${props.userId}/banner.webp`

    const { error: uploadError } = await supabase.storage
      .from(USERS_BUCKET_ID)
      .upload(filePath, file, { upsert: true, contentType: 'image/webp' })

    if (uploadError) {
      saveError.value = uploadError.message
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ has_banner: true })
      .eq('id', props.userId)

    if (profileError) {
      saveError.value = `Banner uploaded but profile update failed: ${profileError.message}`
      return
    }

    const { data: urlData } = supabase.storage
      .from(USERS_BUCKET_ID)
      .getPublicUrl(filePath)

    emit('saved', urlData.publicUrl)
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Unknown error occurred'
  }
  finally {
    saving.value = false
  }
}

async function deleteBanner() {
  if (!props.userId)
    return

  saving.value = true
  saveError.value = null

  try {
    const supabase = useSupabaseClient<Database>()
    const filePath = `${props.userId}/banner.webp`

    await supabase.storage
      .from(USERS_BUCKET_ID)
      .remove([filePath])

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ has_banner: false })
      .eq('id', props.userId)

    if (profileError) {
      saveError.value = `File removed but profile update failed: ${profileError.message}`
      return
    }

    // Reset editor state
    bgType.value = 'solid'
    bgColor.value = '#1a1a2e'
    bgGradientEnd.value = '#16213e'
    bgGradientAngle.value = 90
    for (const layer of layers.value) {
      if (layer.type === 'image' && layer.src.startsWith('blob:'))
        URL.revokeObjectURL(layer.src)
    }
    layers.value = []
    selectedLayerId.value = null
    redraw()
    emit('deleted')
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Unknown error occurred'
  }
  finally {
    saving.value = false
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedLayerId.value) {
      e.preventDefault()
      removeSelectedLayer()
    }
  }
  if (e.key === 'Escape') {
    selectedLayerId.value = null
    redraw()
  }
}

// ── Computed ──────────────────────────────────────────────────────────────────

const workspaceStyle = computed(() => ({
  width: `${WORKSPACE_WIDTH * displayScale.value}px`,
  height: `${WORKSPACE_HEIGHT * displayScale.value}px`,
}))

// ── Watchers ──────────────────────────────────────────────────────────────────

watch([bgType, bgColor, bgGradientEnd, bgGradientAngle], () => redraw())
watch(layers, () => redraw(), { deep: true })

// Reload existing banner whenever the modal is opened
watch(() => props.open, async (isOpen) => {
  if (isOpen && props.userId && !loading.value) {
    const supabase = useSupabaseClient<Database>()
    await loadExistingBanner(supabase, props.userId)
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  updateDisplayScale()

  if (canvasContainerRef.value) {
    resizeObserver = new ResizeObserver(() => updateDisplayScale())
    resizeObserver.observe(canvasContainerRef.value)
  }

  await nextTick()
  redraw()

  if (props.userId) {
    const supabase = useSupabaseClient<Database>()
    await loadExistingBanner(supabase, props.userId)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  for (const layer of layers.value) {
    if (layer.type === 'image' && layer.src.startsWith('blob:'))
      URL.revokeObjectURL(layer.src)
  }
  loadedImages.clear()
})

defineExpose({ saveBanner, deleteBanner, exportToWebPBlob })

// ── Close ─────────────────────────────────────────────────────────────────────

function onClose() {
  emit('close')
}
</script>

<template>
  <Modal size="screen" :open="open" class="banner-editor" hide-close-button @close="onClose">
    <!-- Hidden file input for image layers -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      style="display: none"
      @change="onImageSelected"
    >

    <div class="banner-editor__layout">
      <!-- ── Left: canvas preview area ────────────────────────────────── -->
      <div
        ref="canvasContainerRef"
        class="banner-editor__preview-area"
        tabindex="0"
        @keydown="onKeyDown"
      >
        <div class="banner-editor__workspace" :style="workspaceStyle">
          <div class="banner-editor__canvas-wrap">
            <canvas
              ref="canvasRef"
              :width="WORKSPACE_WIDTH"
              :height="WORKSPACE_HEIGHT"
              :style="workspaceStyle"
              class="banner-editor__canvas"
              @mousedown="onCanvasMouseDown"
              @mousemove="onCanvasMouseMove"
              @mouseup="onCanvasMouseUp"
              @mouseleave="onCanvasMouseUp"
            />
          </div>
        </div>
        <p class="banner-editor__canvas-hint">
          Click to select a layer &middot; Delete key removes selection &middot; Escape deselects
        </p>
      </div>

      <!-- ── Right: controls sidebar ───────────────────────────────────── -->
      <div class="banner-editor__sidebar">
        <!-- Header -->
        <Flex y-center x-between gap="xs" class="banner-editor__sidebar-header">
          <h4>Banner Editor</h4>
          <Flex y-center gap="xs">
            <span v-if="loading" class="banner-editor__hint">
              Loading…
            </span>
            <Button square size="s" plain :disabled="saving" @click="onClose">
              <template #start>
                <Icon name="ph:x" />
              </template>
            </Button>
          </Flex>
        </Flex>

        <!-- Scrollable control groups -->
        <div class="banner-editor__groups">
          <!-- Background -->
          <div class="banner-editor__group">
            <span class="banner-editor__group-label">Background</span>
            <Flex column gap="xs">
              <Flex y-center gap="s">
                <Select
                  v-model="bgTypeModel"
                  :options="BG_TYPE_OPTIONS"
                  single
                  size="s"
                  expand
                />
                <Tooltip>
                  <label class="banner-editor__swatch">
                    <input v-model="bgColor" type="color" class="banner-editor__color-input">
                    <span class="banner-editor__color-preview" :style="{ background: bgColor }" />
                  </label>
                  <template #tooltip>
                    <p>Background colour</p>
                  </template>
                </Tooltip>
                <Tooltip v-if="bgType === 'gradient'">
                  <label class="banner-editor__swatch">
                    <input v-model="bgGradientEnd" type="color" class="banner-editor__color-input">
                    <span class="banner-editor__color-preview" :style="{ background: bgGradientEnd }" />
                  </label>
                  <template #tooltip>
                    <p>Gradient end colour</p>
                  </template>
                </Tooltip>
              </Flex>
              <Flex v-if="bgType === 'gradient'" y-center gap="s">
                <span class="banner-editor__field-label">Angle</span>
                <input
                  v-model.number="bgGradientAngle"
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  class="banner-editor__range"
                >
                <span class="banner-editor__range-value">{{ bgGradientAngle }}&deg;</span>
              </Flex>
            </Flex>
          </div>

          <Divider :size="0" />

          <!-- Layers -->
          <div class="banner-editor__group">
            <span class="banner-editor__group-label">Layers</span>
            <Flex column gap="s">
              <Flex y-center gap="xs">
                <Button size="s" variant="gray" @click="addTextLayer">
                  <template #start>
                    <Icon name="ph:text-t" />
                  </template>
                  Add text
                </Button>
                <Button size="s" variant="gray" @click="openImagePicker">
                  <template #start>
                    <Icon name="ph:image" />
                  </template>
                  Add image
                </Button>
              </Flex>
              <div v-if="layers.length > 0" class="banner-editor__layers">
                <div
                  v-for="(layer, index) in layersReversed"
                  :key="layer.id"
                  class="banner-editor__layer-item"
                  :class="{ 'banner-editor__layer-item--selected': layer.id === selectedLayerId }"
                  @click="selectedLayerId = layer.id; redraw()"
                >
                  <div class="banner-editor__layer-actions">
                    <Tooltip>
                      <Button
                        square
                        size="s"
                        variant="gray"
                        :disabled="index === 0"
                        @click.stop="moveLayerUp(layer.id)"
                      >
                        <Icon name="ph:arrow-up" />
                      </Button>
                      <template #tooltip>
                        <p>Move forward</p>
                      </template>
                    </Tooltip>
                    <Tooltip>
                      <Button
                        square
                        size="s"
                        variant="gray"
                        :disabled="index === layersReversed.length - 1"
                        @click.stop="moveLayerDown(layer.id)"
                      >
                        <Icon name="ph:arrow-down" />
                      </Button>
                      <template #tooltip>
                        <p>Move backward</p>
                      </template>
                    </Tooltip>
                    <Tooltip>
                      <Button
                        square
                        size="s"
                        variant="danger"
                        plain
                        @click.stop="removeLayer(layer.id)"
                      >
                        <Icon name="ph:trash" />
                      </Button>
                      <template #tooltip>
                        <p>Remove layer</p>
                      </template>
                    </Tooltip>
                  </div>
                  <span class="banner-editor__layer-icon">
                    <Icon :name="layer.type === 'text' ? 'ph:text-t' : 'ph:image'" />
                  </span>
                  <span class="banner-editor__layer-label">
                    <template v-if="layer.type === 'text'">
                      {{ layer.content || '(empty)' }}
                    </template>
                    <template v-else>
                      {{ layer.file?.name ?? layer.assetMeta?.originalName ?? 'Image' }}
                    </template>
                  </span>
                </div>
              </div>
            </Flex>
          </div>

          <!-- Text layer controls -->
          <template v-if="selectedTextLayer">
            <Divider :size="0" />
            <div class="banner-editor__group">
              <span class="banner-editor__group-label">Text</span>
              <Flex column gap="xs">
                <Input
                  v-model="selectedTextLayer.content"
                  placeholder="Layer text…"
                  expand
                />
                <Flex y-center gap="s">
                  <Select
                    v-model="fontFamilyModel"
                    :options="FONT_OPTIONS"
                    single
                    size="s"
                    expand
                  />
                  <input
                    v-model.number="selectedTextLayer.fontSize"
                    type="range"
                    :min="TEXT_FONT_SIZE_MIN"
                    :max="TEXT_FONT_SIZE_MAX"
                    step="1"
                    class="banner-editor__range"
                  >
                  <span class="banner-editor__range-value">{{ selectedTextLayer.fontSize }}px</span>
                </Flex>
                <Flex y-center gap="s">
                  <Tooltip>
                    <label class="banner-editor__swatch">
                      <input
                        v-model="selectedTextLayer.color"
                        type="color"
                        class="banner-editor__color-input"
                      >
                      <span
                        class="banner-editor__color-preview"
                        :style="{ background: selectedTextLayer.color }"
                      />
                    </label>
                    <template #tooltip>
                      <p>Text colour</p>
                    </template>
                  </Tooltip>
                  <Tooltip>
                    <Button
                      square
                      size="s"
                      :variant="selectedTextLayer.bold ? 'fill' : 'gray'"
                      @click="selectedTextLayer.bold = !selectedTextLayer.bold"
                    >
                      B
                    </Button>
                    <template #tooltip>
                      <p>Bold</p>
                    </template>
                  </Tooltip>
                  <Tooltip>
                    <Button
                      square
                      size="s"
                      style="font-style: italic"
                      :variant="selectedTextLayer.italic ? 'fill' : 'gray'"
                      @click="selectedTextLayer.italic = !selectedTextLayer.italic"
                    >
                      I
                    </Button>
                    <template #tooltip>
                      <p>Italic</p>
                    </template>
                  </Tooltip>
                </Flex>
              </Flex>
            </div>
          </template>

          <!-- Image layer controls -->
          <template v-if="selectedImageLayer">
            <Divider :size="0" />
            <div class="banner-editor__group">
              <span class="banner-editor__group-label">Image</span>
              <Flex column gap="s">
                <p class="banner-editor__hint">
                  Drag to move &middot; drag corner handle to resize
                </p>
                <p v-if="!selectedImageLayer.src" class="banner-editor__hint">
                  Image file missing. Replace to restore.
                </p>
                <Flex y-center gap="s">
                  <Button size="s" variant="gray" @click="openImagePicker(selectedImageLayer.id)">
                    <template #start>
                      <Icon name="ph:image" />
                    </template>
                    Replace image
                  </Button>
                  <Button size="s" variant="danger" @click="removeSelectedLayer">
                    <template #start>
                      <Icon name="ph:trash" />
                    </template>
                    Remove
                  </Button>
                </Flex>
              </Flex>
            </div>
          </template>
        </div>

        <!-- Footer: save / delete -->
        <div class="banner-editor__sidebar-footer">
          <p v-if="saveError" class="banner-editor__error">
            {{ saveError }}
          </p>
          <p v-if="!userId" class="banner-editor__hint">
            Sign in to save your banner
          </p>
          <Flex x-end y-center gap="s">
            <Button
              variant="danger"
              outline
              size="s"
              :loading="saving"
              :disabled="!userId || loading"
              @click="deleteBanner"
            >
              <template #start>
                <Icon name="ph:trash" />
              </template>
              Delete
            </Button>
            <Button
              variant="accent"
              size="s"
              :loading="saving"
              :disabled="!userId || loading"
              @click="saveBanner"
            >
              <template #start>
                <Icon name="ph:floppy-disk" />
              </template>
              Save banner
            </Button>
          </Flex>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style lang="scss">
// Not scoped — mirrors the ThemeEditor pattern so we can target Modal internals
.banner-editor {
  // ── Two-column full-screen layout ──────────────────────────────────────────

  --height: 100vh;
  --width: 100vw;

  .vui-card-content {
    height: 100%;
  }

  &__layout {
    display: grid;
    grid-template-columns: 1fr 360px;
    height: 97vh;
    width: 100%;
    overflow: hidden;
  }

  // ── Left: canvas preview ───────────────────────────────────────────────────

  &__preview-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-l);
    padding: 0;
    background-color: transparent;
    overflow: hidden;

    &:focus {
      outline: none;
    }
  }

  &__workspace {
    width: auto;
    height: auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  &__canvas-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  &__canvas {
    cursor: crosshair;
    border-radius: var(--border-radius-l);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    image-rendering: auto;
    background-color: var(--color-bg-raised);
    background-image:
      linear-gradient(0deg, color-mix(in srgb, var(--color-border) 40%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--color-border) 40%, transparent) 1px, transparent 1px),
      linear-gradient(0deg, color-mix(in srgb, var(--color-border) 20%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--color-border) 20%, transparent) 1px, transparent 1px);
    background-size:
      24px 24px,
      24px 24px,
      6px 6px,
      6px 6px;

    &:active {
      cursor: grabbing;
    }
  }

  &__canvas-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-lightest);
    text-align: center;
  }

  // ── Right: sidebar ─────────────────────────────────────────────────────────

  &__sidebar {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--color-border);
    height: 100%;
    background-color: var(--color-bg-medium);
  }

  &__sidebar-header {
    padding: var(--space-m);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  &__groups {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    min-width: 0;
  }

  &__group {
    padding: var(--space-m);
    min-width: 0;
  }

  &__group-label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-s);
    padding-left: 2px;
  }

  &__sidebar-footer {
    padding: var(--space-m);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  &__field-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__swatch {
    position: relative;
    cursor: pointer;
    display: inline-flex;
    flex-shrink: 0;
  }

  &__color-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  &__color-preview {
    display: block;
    width: 28px;
    height: 28px;
    border-radius: var(--border-radius-s);
    border: 2px solid var(--color-border);
    transition: border-color var(--transition);

    &:hover {
      border-color: var(--color-border-strong);
    }
  }

  &__range {
    flex: 1;
    min-width: 0;
    accent-color: var(--color-accent);
  }

  &__range-value {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__error {
    font-size: var(--font-size-s);
    color: var(--color-text-red);
  }

  // ── Layers panel ──────────────────────────────────────────────────────────

  &__layers {
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    overflow: hidden;
    min-width: 0;
    width: 100%;
  }

  &__layer-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    cursor: pointer;
    transition: background-color var(--transition);
    border-bottom: 1px solid var(--color-border);
    min-width: 0;
    overflow: hidden;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--color-bg-raised);
    }

    &--selected {
      background: color-mix(in srgb, var(--color-accent, #4fc3f7) 12%, transparent);

      &:hover {
        background: color-mix(in srgb, var(--color-accent, #4fc3f7) 18%, transparent);
      }
    }
  }

  &__layer-icon {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  &__layer-label {
    font-size: var(--font-size-s);
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__layer-actions {
    display: flex;
    gap: var(--space-xxs);
    flex-shrink: 0;
  }
}
</style>
