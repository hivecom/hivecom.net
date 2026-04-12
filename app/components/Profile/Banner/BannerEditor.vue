<script setup lang="ts">
// https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts
/**
 * BannerEditor - A canvas-based editor for creating user forum banners.
 *
 * Banners are horizontal images (728×36) stored as WebP. The editor supports:
 * - Background: solid colour or linear gradient
 * - Multiple text layers with independent font/colour/position
 * - Multiple image layers with drag-to-move and corner-handle resize
 *
 * Editor metadata is serialised as JSON and embedded as a trailing text chunk
 * in the WebP file so the editor state can be restored when re-editing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BannerLayer, BannerMetadata, FillType, GradientStop, ImageAssetMeta, ImageLayer, SelectOption, TextLayer } from './types'
import type { Database } from '@/types/database.types'
import { Button, Checkbox, Flex, Modal } from '@dolanske/vui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { validateImageFile } from '@/lib/storage'
import { USERS_BUCKET_ID } from '@/lib/storageAssets'
import { getCssVarAsHex } from '@/lib/theme'
import BannerEditorBackground from './BannerEditorBackground.vue'
import BannerEditorImagePanel from './BannerEditorImagePanel.vue'
import BannerEditorLayersPanel from './BannerEditorLayersPanel.vue'
import BannerEditorTextPanel from './BannerEditorTextPanel.vue'

export type { BannerLayer, BannerMetadata, FillType, GradientStop, ImageAssetMeta, ImageLayer, TextLayer } from './types'
export type { MetadataImageLayer, MetadataLayer, MetadataTextLayer } from './types'

interface FontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

// ── Internal file-system API types ───────────────────────────────────────────
// (typed as unknown-cast to avoid lib conflicts)
type FsFileHandle = FileSystemFileHandle & { kind: 'file' }
type FsDirHandle = FileSystemDirectoryHandle & {
  kind: 'directory'
  values: () => AsyncIterableIterator<FsFileHandle | FsDirHandle>
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
const BANNER_HEIGHT = 36
const WORKSPACE_PADDING = 120
const WORKSPACE_WIDTH = BANNER_WIDTH + WORKSPACE_PADDING * 2
const WORKSPACE_HEIGHT = BANNER_HEIGHT + WORKSPACE_PADDING * 2
const METADATA_MARKER = '<!-- HIVECOM_BANNER_META:'
const METADATA_END = ':END -->'
const TEXT_FONT_SIZE_MIN = 7
const TEXT_FONT_SIZE_MAX = 108

const FILL_TYPE_OPTIONS: SelectOption<FillType>[] = [
  { label: 'Solid', value: 'solid' },
  { label: 'Linear', value: 'linear' },
  { label: 'Radial', value: 'radial' },
  { label: 'Conic', value: 'conic' },
]

const FALLBACK_FONT_FAMILIES: SelectOption[] = [
  { label: 'Banner (Visitor BRK)', value: 'Visitor BRK' },
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Cursive', value: 'cursive' },
]

const systemFontFamilies = ref<string[]>([])
const fontsLoaded = ref(false)
const fontsPermissionDenied = ref(false)
// When true, show a free-text Input instead of the Select dropdown
const fontCustomMode = ref(false)

// All families as SelectOptions: fallbacks first, then system fonts
const fontOptions = computed<SelectOption[]>(() => {
  const fallbackValues = FALLBACK_FONT_FAMILIES.map(f => f.value)
  const systemOptions: SelectOption[] = systemFontFamilies.value
    .filter(f => !fallbackValues.includes(f))
    .map(f => ({ label: f, value: f }))
  return systemFontFamilies.value.length > 0
    ? [...FALLBACK_FONT_FAMILIES, ...systemOptions]
    : FALLBACK_FONT_FAMILIES
})

async function loadSystemFonts() {
  if (!('queryLocalFonts' in window)) {
    // API not available (Firefox, Safari) - manual entry still works via the text input
    fontsLoaded.value = true
    return
  }
  try {
    const fonts = await (window as Window & { queryLocalFonts: () => Promise<FontData[]> }).queryLocalFonts()
    const families = [...new Set(fonts.map(f => f.family))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
    systemFontFamilies.value = families
    fontsLoaded.value = true
    fontsPermissionDenied.value = false
  }
  catch (err) {
    fontsLoaded.value = true
    fontsPermissionDenied.value = err instanceof DOMException && err.name === 'NotAllowedError'
  }
}

// ── Asset-path settings ───────────────────────────────────────────────────────

const ASSET_PATHS_KEY = 'hivecom:banner-editor:store-asset-paths'
const storeAssetPaths = ref<boolean>(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem(ASSET_PATHS_KEY) === 'true'
    : false,
)
watch(storeAssetPaths, v => localStorage.setItem(ASSET_PATHS_KEY, String(v)))

const hasDirPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window
// webkitdirectory is supported everywhere including Firefox
const hasWebkitDir = typeof window !== 'undefined'

const scanning = ref(false)
const scanResult = ref<string | null>(null)

// ── State ─────────────────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const dirInputRef = ref<HTMLInputElement | null>(null)
const pendingReplaceLayerId = ref<string | null>(null)

const saving = ref(false)
const saveError = ref<string | null>(null)
const loading = ref(false)
const isDirty = ref(false)
const showDiscardConfirm = ref(false)

// Layer clipboard for Ctrl+C / Ctrl+V
const clipboardLayer = ref<BannerLayer | null>(null)

// Background
const bgFillType = ref<FillType>('solid')
const bgFillColor = ref('#1a1a2e')
const bgFillStops = ref<GradientStop[]>([
  { color: '#1a1a2e', position: 0 },
  { color: '#16213e', position: 1 },
])
const bgFillAngle = ref(90)
const bgBorder = ref(true)
const bgBorderColor = ref('#181818')

// Unified layer array
const layers = ref<BannerLayer[]>([])

// Selection
const selectedLayerId = ref<string | null>(null)

const missingLayerCount = computed(() =>
  layers.value.filter(l => l.type === 'image' && !l.src).length,
)
const selectedLayer = computed(() => layers.value.find(l => l.id === selectedLayerId.value) ?? null)
const selectedTextLayer = computed<TextLayer | null>(() =>
  selectedLayer.value?.type === 'text' ? (selectedLayer.value as TextLayer) : null,
)
const selectedImageLayer = computed<ImageLayer | null>(() =>
  selectedLayer.value?.type === 'image' ? (selectedLayer.value as ImageLayer) : null,
)

const bgFillTypeModel = computed<SelectOption<FillType>[] | undefined>({
  get() {
    return [FILL_TYPE_OPTIONS.find(o => o.value === bgFillType.value) ?? FILL_TYPE_OPTIONS[0]!]
  },
  set(selection) {
    const next = selection?.[0]?.value ?? 'solid'
    bgFillType.value = next
    if (next !== 'solid' && bgFillStops.value.length < 2) {
      bgFillStops.value = [
        { color: bgFillColor.value, position: 0 },
        { color: '#000000', position: 1 },
      ]
    }
    redraw()
  },
})

function addBgStop() {
  const stops = bgFillStops.value
  const last = stops.at(-1)?.position ?? 1
  const prev = stops[stops.length - 2]?.position ?? 0
  const pos = Math.round(((prev + last) / 2) * 100) / 100
  stops.push({ color: bgFillColor.value, position: pos })
  stops.sort((a, b) => a.position - b.position)
  redraw()
}

function removeBgStop(index: number) {
  if (bgFillStops.value.length <= 2)
    return
  bgFillStops.value.splice(index, 1)
  redraw()
}

function setBgStopColor(index: number, value: string) {
  const stop = bgFillStops.value[index]
  if (!stop)
    return
  stop.color = value
  redraw()
}

function setBgStopPosition(index: number, value: number) {
  const stop = bgFillStops.value[index]
  if (!stop)
    return
  stop.position = Math.min(1, Math.max(0, value))
  bgFillStops.value.sort((a, b) => a.position - b.position)
  redraw()
}

const fontFamilyModel = computed<SelectOption[] | undefined>({
  get() {
    const layer = selectedTextLayer.value
    if (!layer)
      return undefined
    const match = fontOptions.value.find(o => o.value === layer.fontFamily)
    if (match)
      return [match]
    // Family came from saved metadata and isn't in the list - show it as-is
    return layer.fontFamily ? [{ label: layer.fontFamily, value: layer.fontFamily }] : undefined
  },
  set(selection) {
    const layer = selectedTextLayer.value
    if (!layer)
      return
    const next = selection?.[0]?.value
    if (next != null && next !== '')
      layer.fontFamily = next
    redraw()
  },
})

const fillTypeModel = computed<SelectOption<FillType>[] | undefined>({
  get() {
    const layer = selectedTextLayer.value
    if (!layer)
      return undefined
    return [FILL_TYPE_OPTIONS.find(o => o.value === layer.fillType) ?? FILL_TYPE_OPTIONS[0]!]
  },
  set(selection) {
    const layer = selectedTextLayer.value
    if (!layer)
      return
    const next = selection?.[0]?.value
    if (!next)
      return
    layer.fillType = next
    // Seed stops from fillColor when switching into gradient for the first time
    if (next !== 'solid' && layer.fillStops.length < 2) {
      layer.fillStops = [
        { color: layer.fillColor, position: 0 },
        { color: '#000000', position: 1 },
      ]
    }
    redraw()
  },
})

function addFillStop(layer: TextLayer) {
  // Insert at midpoint between last two stops, or at 0.5 if only one exists
  const stops = layer.fillStops
  const last = stops.at(-1)?.position ?? 1
  const prev = stops[stops.length - 2]?.position ?? 0
  const pos = Math.round(((prev + last) / 2) * 100) / 100
  stops.push({ color: layer.fillColor, position: pos })
  stops.sort((a, b) => a.position - b.position)
  redraw()
}

function removeFillStop(layer: TextLayer, index: number) {
  if (layer.fillStops.length <= 2)
    return
  layer.fillStops.splice(index, 1)
  redraw()
}

function setFillStopColor(layer: TextLayer, index: number, value: string) {
  const stop = layer.fillStops[index]
  if (!stop)
    return
  stop.color = value
  redraw()
}

function setFillStopPosition(layer: TextLayer, index: number, value: number) {
  const stop = layer.fillStops[index]
  if (!stop)
    return
  stop.position = Math.min(1, Math.max(0, value))
  layer.fillStops.sort((a, b) => a.position - b.position)
  redraw()
}

const fontFamilyCustom = computed<string>({
  get() {
    return selectedTextLayer.value?.fontFamily ?? ''
  },
  set(value: string) {
    const layer = selectedTextLayer.value
    if (!layer)
      return
    if (value.trim() !== '')
      layer.fontFamily = value.trim()
    redraw()
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
const canvasScrollRef = ref<HTMLDivElement | null>(null)
const fitScale = ref(1)
const zoomLevel = ref(1) // multiplier on top of fit scale, range 0.25–4

const displayScale = computed(() => fitScale.value * zoomLevel.value)

function updateDisplayScale() {
  if (!canvasContainerRef.value)
    return
  const containerWidth = canvasContainerRef.value.clientWidth
  // Leave room for the zoom bar (48px) and some breathing room
  const containerHeight = canvasContainerRef.value.clientHeight - 48
  const scaleByWidth = containerWidth / WORKSPACE_WIDTH
  const scaleByHeight = containerHeight / WORKSPACE_HEIGHT
  fitScale.value = Math.min(1, scaleByWidth, scaleByHeight)
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function buildMetadata(): BannerMetadata {
  return {
    version: 3,
    creatorId: props.userId ?? undefined,
    background: {
      fillType: bgFillType.value,
      fillColor: bgFillColor.value,
      fillStops: bgFillStops.value,
      fillAngle: bgFillAngle.value,
      border: bgBorder.value,
      borderColor: bgBorderColor.value,
    },
    layers: layers.value.map((l) => {
      if (l.type === 'text') {
        return {
          id: l.id,
          type: 'text' as const,
          content: l.content,
          fontFamily: l.fontFamily,
          fontSize: l.fontSize,
          fillType: l.fillType,
          fillColor: l.fillColor,
          fillStops: l.fillStops,
          fillAngle: l.fillAngle,
          opacity: l.opacity,
          rotation: l.rotation,
          x: l.x,
          y: l.y,
          bold: l.bold,
          italic: l.italic,
          outline: l.outline,
          outlineColor: l.outlineColor,
          outlineWidth: l.outlineWidth,
          shadow: l.shadow,
          shadowColor: l.shadowColor,
          shadowBlur: l.shadowBlur,
          shadowOffsetX: l.shadowOffsetX,
          shadowOffsetY: l.shadowOffsetY,
        }
      }
      return {
        id: l.id,
        type: 'image' as const,
        rotation: l.rotation,
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
  const bg = meta.background
  // Migrate legacy solid/gradient fields
  const legacyFillType: FillType = bg.type === 'gradient' ? 'linear' : 'solid'
  const legacyColor = bg.color ?? '#1a1a2e'
  const legacyStops: GradientStop[] = bg.gradientEnd != null
    ? [{ color: legacyColor, position: 0 }, { color: bg.gradientEnd, position: 1 }]
    : [{ color: legacyColor, position: 0 }, { color: '#16213e', position: 1 }]

  bgFillType.value = bg.fillType ?? legacyFillType
  bgFillColor.value = bg.fillColor ?? legacyColor
  bgFillStops.value = bg.fillStops ?? legacyStops
  bgFillAngle.value = bg.fillAngle ?? bg.gradientAngle ?? 90
  bgBorder.value = bg.border ?? false
  bgBorderColor.value = bg.borderColor ?? '#ffffff'

  layers.value = meta.layers.map((l): BannerLayer => {
    if (l.type === 'text') {
      // Migrate legacy color/gradientColor fields to fillStops
      const legacyFillType: FillType = l.gradientColor != null ? 'linear' : 'solid'
      const legacyColor = l.color ?? '#ffffff'
      const legacyStops: GradientStop[] = l.gradientColor != null
        ? [{ color: legacyColor, position: 0 }, { color: l.gradientColor, position: 1 }]
        : [{ color: legacyColor, position: 0 }, { color: '#000000', position: 1 }]

      return {
        id: l.id,
        type: 'text',
        content: l.content,
        fontFamily: l.fontFamily,
        fontSize: Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, l.fontSize)),
        fillType: l.fillType ?? legacyFillType,
        fillColor: l.fillColor ?? legacyColor,
        fillStops: l.fillStops ?? legacyStops,
        fillAngle: l.fillAngle ?? l.gradientAngle ?? 0,
        opacity: l.opacity ?? 1,
        rotation: l.rotation ?? 0,
        x: l.x,
        y: l.y,
        bold: l.bold,
        italic: l.italic,
        outline: l.outline ?? false,
        outlineColor: l.outlineColor ?? '#ffffff',
        outlineWidth: l.outlineWidth ?? 1,
        shadow: l.shadow ?? true,
        shadowColor: l.shadowColor ?? '#000000',
        shadowBlur: l.shadowBlur ?? 4,
        shadowOffsetX: l.shadowOffsetX ?? 1,
        shadowOffsetY: l.shadowOffsetY ?? 1,
      }
    }
    const assetMeta: ImageAssetMeta = l.asset ?? {
      originalName: l.originalName ?? 'image',
      size: null,
      type: null,
      lastModified: null,
      folderName: null,
      folderRelativePath: null,
    }
    return {
      id: l.id,
      type: 'image',
      // Pixel data cannot be extracted from the composite WebP.
      // The layer renders blank until the image file is re-added.
      src: '',
      file: null,
      assetMeta,
      rotation: l.rotation ?? 0,
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
  if (bgFillType.value !== 'solid' && bgFillStops.value.length >= 2) {
    const cx = BANNER_WIDTH / 2
    const cy = BANNER_HEIGHT / 2
    let grad: CanvasGradient
    if (bgFillType.value === 'linear') {
      const angleRad = (bgFillAngle.value * Math.PI) / 180
      const len = Math.max(BANNER_WIDTH, BANNER_HEIGHT)
      const dx = Math.cos(angleRad) * len
      const dy = Math.sin(angleRad) * len
      grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    }
    else if (bgFillType.value === 'radial') {
      const r = Math.max(BANNER_WIDTH, BANNER_HEIGHT) / 2
      grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    }
    else {
      // conic
      const angleRad = (bgFillAngle.value * Math.PI) / 180
      grad = ctx.createConicGradient(angleRad, cx, cy)
    }
    for (const stop of bgFillStops.value)
      grad.addColorStop(stop.position, stop.color)
    ctx.fillStyle = grad
  }
  else {
    ctx.fillStyle = bgFillColor.value
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
  drawLayers(ctx)

  // Border drawn last so it always sits above all layers
  if (bgBorder.value) {
    ctx.strokeStyle = bgBorderColor.value
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, BANNER_WIDTH - 1, BANNER_HEIGHT - 1)
  }

  ctx.restore()

  // Render guides outside the clipped banner bounds
  drawSelectionIndicators(ctx)
  drawBannerBoundary(ctx)

  ctx.restore()
}

/**
 * Draw all layers onto ctx. The context is assumed to already be translated so
 * that (0,0) maps to the top-left of the banner export area.
 *
 * Used by both redraw() (with WORKSPACE_PADDING translate applied upstream) and
 * exportToWebPBlob() (no padding - ctx origin is already the banner origin).
 */
function drawLayers(ctx: CanvasRenderingContext2D, opts: { forExport?: boolean } = {}) {
  for (const layer of layers.value) {
    if (layer.type === 'image') {
      if (!layer.src)
        continue
      const img = opts.forExport ? loadedImages.get(layer.src) : getOrLoadImage(layer.src)
      if (!img?.complete)
        continue

      let source: CanvasImageSource = img
      if (opts.forExport && (img.naturalWidth > layer.width * 2 || img.naturalHeight > layer.height * 2)) {
        // Downsample oversized source images to avoid memory bloat on export
        const tmp = document.createElement('canvas')
        tmp.width = layer.width
        tmp.height = layer.height
        const tmpCtx = tmp.getContext('2d')
        if (tmpCtx)
          tmpCtx.drawImage(img, 0, 0, layer.width, layer.height)
        source = tmp
      }

      const cx = layer.x + layer.width / 2
      const cy = layer.y + layer.height / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
      ctx.restore()
    }
    else if (layer.type === 'text') {
      if (!layer.content.trim())
        continue
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.translate(layer.x, layer.y)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.font = buildFontStyle(layer)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (layer.fillType !== 'solid' && layer.fillStops.length >= 2) {
        const metrics = ctx.measureText(layer.content)
        const tw = metrics.width
        const th = layer.fontSize

        let grad: CanvasGradient
        if (layer.fillType === 'linear') {
          const angleRad = (layer.fillAngle * Math.PI) / 180
          const dx = Math.cos(angleRad) * tw / 2
          const dy = Math.sin(angleRad) * tw / 2
          grad = ctx.createLinearGradient(-dx, -dy, dx, dy)
        }
        else if (layer.fillType === 'radial') {
          const r = Math.max(tw, th) / 2
          grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
        }
        else {
          // conic
          const angleRad = (layer.fillAngle * Math.PI) / 180
          grad = ctx.createConicGradient(angleRad, 0, 0)
        }
        for (const stop of layer.fillStops)
          grad.addColorStop(stop.position, stop.color)
        ctx.fillStyle = grad
      }
      else {
        ctx.fillStyle = layer.fillColor
      }

      // Outline drawn first (behind fill) so the stroke doesn't overlap the text
      if (layer.outline) {
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.lineWidth = layer.outlineWidth * 2
        ctx.strokeStyle = layer.outlineColor
        ctx.strokeText(layer.content, 0, 0)
      }

      // Shadow
      if (layer.shadow) {
        ctx.shadowColor = layer.shadowColor
        ctx.shadowBlur = layer.shadowBlur
        ctx.shadowOffsetX = layer.shadowOffsetX
        ctx.shadowOffsetY = layer.shadowOffsetY
      }
      else {
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
      }
      ctx.fillText(layer.content, 0, 0)
      ctx.restore()
    }
  }
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
      ctx.save()
      ctx.translate(layer.x, layer.y)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.strokeStyle = isSelected ? '#4fc3f7' : 'rgba(255,255,255,0.5)'
      ctx.strokeRect(-tw / 2 - 4, -th / 2 - 4, tw + 8, th + 8)
      ctx.restore()
    }
    else if (layer.type === 'image') {
      const cx = layer.x + layer.width / 2
      const cy = layer.y + layer.height / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.strokeStyle = isSelected ? '#4fc3f7' : 'rgba(255,255,255,0.5)'
      ctx.strokeRect(-layer.width / 2 - 1, -layer.height / 2 - 1, layer.width + 2, layer.height + 2)
      if (isSelected) {
        const handleSize = 8
        ctx.setLineDash([])
        ctx.fillStyle = '#4fc3f7'
        ctx.fillRect(
          layer.width / 2 - handleSize / 2,
          layer.height / 2 - handleSize / 2,
          handleSize,
          handleSize,
        )
        ctx.setLineDash([4, 4])
      }
      ctx.restore()
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

/** Returns true if the mouse event is positioned over the canvas element. */
function isOverCanvas(e: MouseEvent): boolean {
  const canvas = canvasRef.value
  if (!canvas)
    return false
  const rect = canvas.getBoundingClientRect()
  return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
}

/** Rotate point (px, py) around (cx, cy) by -angle degrees (inverse rotation for hit testing). */
function rotatePoint(px: number, py: number, cx: number, cy: number, angleDeg: number): { x: number, y: number } {
  const rad = (-angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = px - cx
  const dy = py - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
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
  // Rotate the test point into layer-local (unrotated) space
  const local = rotatePoint(x, y, layer.x, layer.y, layer.rotation)
  return (
    local.x >= layer.x - tw / 2 - pad
    && local.x <= layer.x + tw / 2 + pad
    && local.y >= layer.y - th / 2 - pad
    && local.y <= layer.y + th / 2 + pad
  )
}

function hitTestImageLayer(x: number, y: number, layer: ImageLayer): boolean {
  const cx = layer.x + layer.width / 2
  const cy = layer.y + layer.height / 2
  const local = rotatePoint(x, y, cx, cy, layer.rotation)
  return local.x >= layer.x && local.x <= layer.x + layer.width && local.y >= layer.y && local.y <= layer.y + layer.height
}

function hitTestImageResizeHandle(x: number, y: number, layer: ImageLayer): boolean {
  const cx = layer.x + layer.width / 2
  const cy = layer.y + layer.height / 2
  const handleSize = 12
  const hx = layer.x + layer.width
  const hy = layer.y + layer.height
  const local = rotatePoint(x, y, cx, cy, layer.rotation)
  return local.x >= hx - handleSize && local.x <= hx + handleSize && local.y >= hy - handleSize && local.y <= hy + handleSize
}

// ── Mouse handlers ────────────────────────────────────────────────────────────

// Whether the pointer is currently over the resize handle
const cursorOnResizeHandle = ref(false)

// Pan state — dragging on empty canvas space translates the workspace
const panning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const panOffset = ref({ x: 0, y: 0 })
const panOffsetAtStart = ref({ x: 0, y: 0 })

function onCanvasMouseDown(e: MouseEvent) {
  // Click outside canvas bounds — just start a pan, don't touch selection
  if (!isOverCanvas(e)) {
    panning.value = true
    panStart.value = { x: e.clientX, y: e.clientY }
    panOffsetAtStart.value = { x: panOffset.value.x, y: panOffset.value.y }
    return
  }

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

  // Clicked empty space — start pan or deselect
  panning.value = true
  panStart.value = { x: e.clientX, y: e.clientY }
  panOffsetAtStart.value = { x: panOffset.value.x, y: panOffset.value.y }
  selectedLayerId.value = null
  redraw()
}

function onScrollAreaMouseUp() {
  onCanvasMouseUp()
}

function onScrollAreaWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  zoomLevel.value = Math.min(4, Math.max(0.25, Math.round((zoomLevel.value + delta) * 100) / 100))
}

function onCanvasMouseUp() {
  dragging.value = null
  draggingLayerId.value = null
  resizingLayerId.value = null
  cursorOnResizeHandle.value = false
  panning.value = false
}

// ── Layer management ──────────────────────────────────────────────────────────

function addTextLayer() {
  const layer: TextLayer = {
    id: crypto.randomUUID(),
    type: 'text',
    content: 'Text',
    fontFamily: 'Visitor BRK',
    fontSize: 26,
    fillType: 'solid',
    fillColor: getCssVarAsHex('--color-text', '#ffffff'),
    fillStops: [
      { color: getCssVarAsHex('--color-text', '#ffffff'), position: 0 },
      { color: getCssVarAsHex('--color-text-lighter', '#888888'), position: 1 },
    ],
    fillAngle: 0,
    opacity: 1,
    rotation: 0,
    x: Math.round(BANNER_WIDTH / 2),
    y: Math.round(BANNER_HEIGHT / 2),
    bold: false,
    italic: false,
    outline: false,
    outlineColor: '#ffffff',
    outlineWidth: 1,
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
  }
  layers.value.push(layer)
  selectedLayerId.value = layer.id
  redraw()
}

function openImagePicker(layerId?: string) {
  pendingReplaceLayerId.value = layerId ?? null
  fileInputRef.value?.click()
}

function buildAssetMeta(file: File, folderName?: string | null, folderRelativePath?: string | null): ImageAssetMeta {
  return {
    originalName: file.name,
    size: file.size,
    type: file.type || null,
    lastModified: file.lastModified ?? null,
    folderName: storeAssetPaths.value ? (folderName ?? null) : null,
    folderRelativePath: storeAssetPaths.value ? (folderRelativePath ?? null) : null,
  }
}

function layerMatchesFile(layer: ImageLayer, file: File): boolean {
  const meta = layer.assetMeta
  if (!meta)
    return false
  const nameMatches = meta.originalName === file.name
  const sizeMatches = meta.size == null || meta.size === file.size
  const typeMatches = meta.type == null || meta.type === file.type
  const modifiedMatches = meta.lastModified == null || meta.lastModified === file.lastModified
  return nameMatches && sizeMatches && typeMatches && modifiedMatches
}

function relinkLayer(layer: ImageLayer, file: File, url: string, folderName?: string | null, folderRelativePath?: string | null) {
  if (layer.src && layer.src.startsWith('blob:')) {
    URL.revokeObjectURL(layer.src)
    loadedImages.delete(layer.src)
  }
  layer.src = url
  layer.file = file
  layer.assetMeta = buildAssetMeta(file, folderName, folderRelativePath)
}

/** Shared matching + re-link logic for both picker and webkitdirectory paths. */
function processFileList(
  entries: Array<{ file: File, relativePath: string, folderName: string }>,
): number {
  const missingLayers = layers.value.filter((l): l is ImageLayer => l.type === 'image' && !l.src)
  let linked = 0
  for (const layer of missingLayers) {
    const match = entries.find(({ file }) => layerMatchesFile(layer, file))
    if (!match)
      continue
    const url = URL.createObjectURL(match.file)
    relinkLayer(layer, match.file, url, match.folderName, match.relativePath)
    linked++
  }
  return linked
}

async function scanFolder() {
  scanning.value = true
  scanResult.value = null
  try {
    if (hasDirPicker) {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FsDirHandle> }).showDirectoryPicker()

      async function collectFiles(
        handle: FsDirHandle,
        prefix: string,
      ): Promise<Array<{ file: File, relativePath: string, folderName: string }>> {
        const results: Array<{ file: File, relativePath: string, folderName: string }> = []
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const file = await (entry as FsFileHandle).getFile()
            results.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : file.name, folderName: dirHandle.name })
          }
          else if (entry.kind === 'directory') {
            const sub = await collectFiles(
              entry as FsDirHandle,
              prefix ? `${prefix}/${entry.name}` : entry.name,
            )
            results.push(...sub)
          }
        }
        return results
      }

      const allFiles = await collectFiles(dirHandle, '')
      const linked = processFileList(allFiles)
      scanResult.value = linked > 0
        ? `Re-linked ${linked} image${linked === 1 ? '' : 's'}.`
        : 'No matching images found in that folder.'
      redraw()
    }
    else {
      // Firefox / Safari fallback: trigger a hidden <input webkitdirectory>
      // Result is handled in onDirSelected
      dirInputRef.value?.click()
      // scanning stays true until onDirSelected finishes
    }
  }
  catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError'))
      scanResult.value = 'Could not open folder.'
    scanning.value = false
  }
  finally {
    // For the API path, clear scanning here. For the input path it's cleared in onDirSelected.
    if (hasDirPicker)
      scanning.value = false
  }
}

function onDirSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) {
    scanning.value = false
    scanResult.value = null
    input.value = ''
    return
  }
  const entries = Array.from(files).map((file) => {
    // webkitRelativePath is "folderName/sub/file.png"
    const parts = file.webkitRelativePath.split('/')
    const folderName = parts[0] ?? ''
    // relativePath is everything after the top-level folder name
    const relativePath = parts.slice(1).join('/') || file.name
    return { file, relativePath, folderName }
  })
  const linked = processFileList(entries)
  scanResult.value = linked > 0
    ? `Re-linked ${linked} image${linked === 1 ? '' : 's'}.`
    : 'No matching images found in that folder.'
  redraw()
  scanning.value = false
  input.value = ''
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
    const match = layers.value.find((layer): layer is ImageLayer => {
      if (layer.type !== 'image' || !!layer.src)
        return false
      return layerMatchesFile(layer, file)
    })
    if (match)
      targetLayerId = match.id
  }

  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const aspect = img.width / img.height

    if (targetLayerId) {
      const existing = layers.value.find(l => l.id === targetLayerId)
      if (existing && existing.type === 'image') {
        const { width, height, aspect: storedAspect } = existing
        relinkLayer(existing, file, url)
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
      assetMeta: buildAssetMeta(file),
      rotation: 0,
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

function duplicateLayer(id: string) {
  const src = layers.value.find(l => l.id === id)
  if (!src)
    return
  const newId = crypto.randomUUID()
  let clone: BannerLayer
  if (src.type === 'text') {
    clone = { ...src, id: newId, x: src.x + 6, y: src.y + 6 }
  }
  else {
    clone = { ...src, id: newId, x: src.x + 6, y: src.y + 6, file: src.file, src: src.src }
  }
  const idx = layers.value.findIndex(l => l.id === id)
  layers.value.splice(idx + 1, 0, clone)
  selectedLayerId.value = newId
  redraw()
}

function setImageX(layer: ImageLayer, raw: string) {
  const v = Number.parseInt(raw, 10)
  if (!Number.isFinite(v))
    return
  layer.x = v
  redraw()
}

function setImageY(layer: ImageLayer, raw: string) {
  const v = Number.parseInt(raw, 10)
  if (!Number.isFinite(v))
    return
  layer.y = v
  redraw()
}

function setImageWidth(layer: ImageLayer, raw: string) {
  const v = Math.max(4, Number.parseInt(raw, 10))
  if (!Number.isFinite(v))
    return
  layer.width = v
  layer.height = Math.round(v / layer.aspect)
  redraw()
}

function setImageHeight(layer: ImageLayer, raw: string) {
  const v = Math.max(4, Number.parseInt(raw, 10))
  if (!Number.isFinite(v))
    return
  layer.height = v
  layer.width = Math.round(v * layer.aspect)
  redraw()
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
  drawLayers(ctx, { forExport: true })

  // Border drawn last so it always sits above all layers
  if (bgBorder.value) {
    ctx.strokeStyle = bgBorderColor.value
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, BANNER_WIDTH - 1, BANNER_HEIGHT - 1)
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
    await nextTick()
    isDirty.value = false
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

    // Guard: decode the blob and verify it is exactly the canonical 728×48
    // dimensions before we allow the upload. This catches any path that
    // somehow bypasses the canvas export (e.g. programmatic misuse of the
    // exposed saveBanner method).
    const bitmap = await createImageBitmap(blob)
    const { width: bw, height: bh } = bitmap
    bitmap.close()
    if (bw !== BANNER_WIDTH || bh !== BANNER_HEIGHT) {
      saveError.value = `Banner must be exactly ${BANNER_WIDTH}×${BANNER_HEIGHT} px (got ${bw}×${bh}).`
      return
    }

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

    isDirty.value = false
    emit('saved', urlData.publicUrl)
    emit('close')
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
    bgFillType.value = 'solid'
    bgFillColor.value = '#1a1a2e'
    bgFillStops.value = [{ color: '#1a1a2e', position: 0 }, { color: '#16213e', position: 1 }]
    bgFillAngle.value = 90
    bgBorder.value = false
    bgBorderColor.value = '#ffffff'
    for (const layer of layers.value) {
      if (layer.type === 'image' && layer.src.startsWith('blob:'))
        URL.revokeObjectURL(layer.src)
    }
    layers.value = []
    selectedLayerId.value = null
    redraw()
    isDirty.value = false
    emit('deleted')
    emit('close')
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
}

function copySelectedLayer() {
  const layer = selectedLayer.value
  if (!layer)
    return
  // Deep clone so mutations to the original don't affect the clipboard
  clipboardLayer.value = JSON.parse(JSON.stringify(layer)) as BannerLayer
}

function pasteLayer() {
  const src = clipboardLayer.value
  if (!src)
    return
  const newId = crypto.randomUUID()
  let clone: BannerLayer
  if (src.type === 'text') {
    clone = { ...src, id: newId, x: src.x + 6, y: src.y + 6 }
  }
  else {
    // Image layers pasted from clipboard won't have a live src/file -
    // reuse whatever was captured at copy time (blob URL may still be valid)
    clone = { ...src, id: newId, x: src.x + 6, y: src.y + 6 }
  }
  layers.value.push(clone)
  selectedLayerId.value = newId
  redraw()
}

// ── Computed ──────────────────────────────────────────────────────────────────

const workspaceStyle = computed(() => ({
  width: `${WORKSPACE_WIDTH * displayScale.value}px`,
  height: `${WORKSPACE_HEIGHT * displayScale.value}px`,
  flexShrink: '0',
  transform: `translate(${panOffset.value.x}px, ${panOffset.value.y}px)`,
}))

// Cursor to show on the canvas based on hover/drag state
const canvasCursor = computed(() => {
  if (panning.value)
    return 'grabbing'
  if (dragging.value === 'layer')
    return 'grabbing'
  if (resizingLayerId.value)
    return 'nw-resize'
  if (cursorOnResizeHandle.value)
    return 'nw-resize'
  if (hoveredLayerId.value)
    return 'grab'
  // Show grab cursor on empty canvas to hint that panning is available
  return 'grab'
})

// ── Watchers ──────────────────────────────────────────────────────────────────

watch([bgFillType, bgFillColor, bgFillAngle], () => redraw())
watch(bgFillStops, () => redraw(), { deep: true })
// Text fill changes are caught by the deep layers watcher below
watch(layers, () => redraw(), { deep: true })

watch([bgFillType, bgFillColor, bgFillAngle, bgFillStops, bgBorder, bgBorderColor], () => {
  isDirty.value = true
}, { deep: true })
watch(layers, () => {
  isDirty.value = true
}, { deep: true })

// Reload existing banner whenever the modal is opened; also trigger font load
watch(() => props.open, async (isOpen) => {
  if (isOpen && props.userId && !loading.value) {
    const supabase = useSupabaseClient<Database>()
    await loadExistingBanner(supabase, props.userId)
  }
  if (isOpen && !fontsLoaded.value) {
    void loadSystemFonts()
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null

function requestClose() {
  if (isDirty.value) {
    showDiscardConfirm.value = true
  }
  else {
    emit('close')
  }
}

function onWindowKeyDownCapture(e: KeyboardEvent) {
  if (!props.open)
    return

  const ctrl = e.ctrlKey || e.metaKey

  if (ctrl && e.key === 'c') {
    if (selectedLayerId.value) {
      e.preventDefault()
      copySelectedLayer()
    }
    return
  }

  if (ctrl && e.key === 'v') {
    if (clipboardLayer.value) {
      e.preventDefault()
      pasteLayer()
    }
    return
  }

  if (ctrl && e.key === 'd') {
    if (selectedLayerId.value) {
      e.preventDefault()
      duplicateLayer(selectedLayerId.value)
    }
    return
  }

  if (e.key !== 'Escape')
    return
  e.preventDefault()
  e.stopImmediatePropagation()
  if (selectedLayerId.value) {
    selectedLayerId.value = null
    redraw()
  }
  else {
    nextTick(() => requestClose())
  }
}

onMounted(async () => {
  document.addEventListener('mousemove', onDocumentMouseMove)
  document.addEventListener('mouseup', onDocumentMouseUp)
  // Capture phase so we intercept before VUI's bubble-phase window listener
  window.addEventListener('keydown', onWindowKeyDownCapture, true)

  updateDisplayScale()

  if (canvasContainerRef.value) {
    resizeObserver = new ResizeObserver(() => updateDisplayScale())
    resizeObserver.observe(canvasContainerRef.value)
  }

  // Apply VUI theme colours as defaults for new banners
  const colorBg = getCssVarAsHex('--color-bg', '#1a1a2e')
  const colorBgRaised = getCssVarAsHex('--color-bg-raised', '#16213e')
  bgFillColor.value = colorBg
  bgFillStops.value = [
    { color: colorBg, position: 0 },
    { color: colorBgRaised, position: 1 },
  ]
  bgBorderColor.value = getCssVarAsHex('--color-border-weak', '#181818')

  await nextTick()
  redraw()
  isDirty.value = false

  if (props.userId) {
    const supabase = useSupabaseClient<Database>()
    await loadExistingBanner(supabase, props.userId)
  }
})

function onDocumentMouseMove(e: MouseEvent) {
  if (panning.value) {
    panOffset.value = {
      x: panOffsetAtStart.value.x + (e.clientX - panStart.value.x),
      y: panOffsetAtStart.value.y + (e.clientY - panStart.value.y),
    }
    return
  }

  // Resize — works regardless of where mouse is
  if (resizingLayerId.value) {
    const layer = layers.value.find(l => l.id === resizingLayerId.value)
    if (layer && layer.type === 'image') {
      const pos = canvasToLocal(e)
      const cx = layer.x + resizeStartSize.value.width / 2
      const cy = layer.y + resizeStartSize.value.height / 2
      const localCurrent = rotatePoint(pos.x, pos.y, cx, cy, layer.rotation)
      const localStart = rotatePoint(resizeStartPos.value.x, resizeStartPos.value.y, cx, cy, layer.rotation)
      const dx = localCurrent.x - localStart.x
      const newWidth = Math.max(16, resizeStartSize.value.width + dx)
      if (e.shiftKey) {
        const dy = localCurrent.y - localStart.y
        layer.width = Math.round(newWidth)
        layer.height = Math.round(Math.max(4, resizeStartSize.value.height + dy))
      }
      else {
        layer.width = Math.round(newWidth)
        layer.height = Math.round(newWidth / layer.aspect)
      }
      redraw()
    }
    return
  }

  // Drag — works regardless of where mouse is
  if (dragging.value === 'layer' && draggingLayerId.value) {
    const layer = layers.value.find(l => l.id === draggingLayerId.value)
    if (layer) {
      const pos = canvasToLocal(e)
      layer.x = Math.round(pos.x - dragOffset.value.x)
      layer.y = Math.round(pos.y - dragOffset.value.y)
      redraw()
    }
    return
  }

  // Idle — only do hover detection if the mouse is actually over the canvas.
  // Use a single getBoundingClientRect call shared by the over-canvas check and canvasToLocal.
  const canvas = canvasRef.value
  if (!canvas)
    return
  const rect = canvas.getBoundingClientRect()
  if (
    e.clientX < rect.left || e.clientX > rect.right
    || e.clientY < rect.top || e.clientY > rect.bottom
  ) {
    return
  }

  const scaleX = WORKSPACE_WIDTH / rect.width
  const scaleY = WORKSPACE_HEIGHT / rect.height
  const pos = {
    x: (e.clientX - rect.left) * scaleX - WORKSPACE_PADDING,
    y: (e.clientY - rect.top) * scaleY - WORKSPACE_PADDING,
  }

  if (selectedLayerId.value) {
    const sel = layers.value.find(l => l.id === selectedLayerId.value)
    if (sel?.type === 'image') {
      cursorOnResizeHandle.value = hitTestImageResizeHandle(pos.x, pos.y, sel)
    }
    else {
      cursorOnResizeHandle.value = false
    }
  }
  else {
    cursorOnResizeHandle.value = false
  }

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

function onDocumentMouseUp() {
  if (panning.value)
    panning.value = false
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocumentMouseMove)
  document.removeEventListener('mouseup', onDocumentMouseUp)
  window.removeEventListener('keydown', onWindowKeyDownCapture, true)
  resizeObserver?.disconnect()
  for (const layer of layers.value) {
    if (layer.type === 'image' && layer.src.startsWith('blob:'))
      URL.revokeObjectURL(layer.src)
  }
  loadedImages.clear()
})

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Import an external WebP file into the editor. If the file contains embedded
 * Hivecom banner metadata the editor state is fully restored from it. Otherwise
 * the image is placed as a centered image layer so the user can keep editing.
 */
async function importBanner(file: File): Promise<{ hadMetadata: boolean }> {
  // Try to extract embedded metadata first
  const bytes = new Uint8Array(await file.arrayBuffer())
  const text = new TextDecoder().decode(bytes)
  const markerIndex = text.lastIndexOf(METADATA_MARKER)

  if (markerIndex >= 0) {
    const endIndex = text.indexOf(METADATA_END, markerIndex)
    if (endIndex >= 0) {
      const jsonStr = text.substring(markerIndex + METADATA_MARKER.length, endIndex)
      try {
        const meta = JSON.parse(jsonStr) as BannerMetadata
        applyMetadata(meta)
        await nextTick()
        redraw()
        return { hadMetadata: true }
      }
      catch {
        // Fall through to image-layer fallback
      }
    }
  }

  // No metadata found - place the whole image as a centred image layer
  await new Promise<void>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const aspect = img.width / img.height
      const height = Math.min(BANNER_HEIGHT, img.height)
      const width = Math.round(height * aspect)
      const layer: ImageLayer = {
        id: crypto.randomUUID(),
        type: 'image',
        src: url,
        file,
        assetMeta: buildAssetMeta(file),
        rotation: 0,
        x: Math.round((BANNER_WIDTH - width) / 2),
        y: Math.round((BANNER_HEIGHT - height) / 2),
        width,
        height,
        aspect,
      }
      layers.value = [layer]
      selectedLayerId.value = layer.id
      nextTick(() => redraw())
      resolve()
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    img.src = url
  })

  return { hadMetadata: false }
}

// ── Text-layer panel helpers ──────────────────────────────────────────────────
// Thin wrappers so BannerEditorTextPanel can call these without non-null
// assertions in template expressions.

function addSelectedTextFillStop() {
  if (selectedTextLayer.value)
    addFillStop(selectedTextLayer.value)
}

function removeSelectedTextFillStop(index: number) {
  if (selectedTextLayer.value)
    removeFillStop(selectedTextLayer.value, index)
}

function setSelectedTextFillStopColor(index: number, color: string) {
  if (selectedTextLayer.value)
    setFillStopColor(selectedTextLayer.value, index, color)
}

function setSelectedTextFillStopPosition(index: number, position: number) {
  if (selectedTextLayer.value)
    setFillStopPosition(selectedTextLayer.value, index, position)
}

function onTextLayerFillAngle(angle: number) {
  if (selectedTextLayer.value) {
    selectedTextLayer.value.fillAngle = angle
    redraw()
  }
}

defineExpose({ saveBanner, deleteBanner, exportToWebPBlob, importBanner })
// saveBanner is also used externally after importBanner when hadMetadata is true
</script>

<template>
  <Modal size="screen" :open="open" class="banner-editor" hide-close-button @close="emit('close')">
    <!-- Hidden file input for image layers -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      style="display: none"
      @change="onImageSelected"
    >
    <input
      ref="dirInputRef"
      type="file"
      webkitdirectory
      multiple
      style="display: none"
      @change="onDirSelected"
    >

    <div class="banner-editor__layout">
      <!-- ── Left: canvas preview area ────────────────────────────────── -->
      <div
        ref="canvasContainerRef"
        class="banner-editor__preview-area"
        tabindex="0"
        @keydown="onKeyDown"
      >
        <div
          ref="canvasScrollRef"
          class="banner-editor__canvas-scroll"
          :style="{ cursor: canvasCursor }"
          @mousedown="onCanvasMouseDown"
          @mouseup="onScrollAreaMouseUp"
          @wheel="onScrollAreaWheel"
        >
          <div class="banner-editor__workspace" :style="workspaceStyle">
            <div class="banner-editor__canvas-wrap">
              <canvas
                ref="canvasRef"
                :width="WORKSPACE_WIDTH"
                :height="WORKSPACE_HEIGHT"
                :style="workspaceStyle"
                class="banner-editor__canvas"
                draggable="false"
              />
            </div>
          </div>
        </div>
        <div class="banner-editor__zoom-bar">
          <span class="banner-editor__zoom-label">{{ Math.round(zoomLevel * 100) }}%</span>
          <input
            v-model.number="zoomLevel"
            type="range"
            min="0.25"
            max="4"
            step="0.05"
            class="banner-editor__range banner-editor__zoom-range"
          >
          <button class="banner-editor__zoom-reset" @click="zoomLevel = 1">
            Reset
          </button>
          <p class="banner-editor__canvas-hint">
            Click to select &middot; Drag to move &middot; Delete removes &middot; Esc deselects
          </p>
        </div>
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
            <Button square size="s" plain :disabled="saving" @click="requestClose()">
              <Icon name="ph:x" />
            </Button>
          </Flex>
        </Flex>

        <!-- Scrollable control groups -->
        <div class="banner-editor__groups">
          <div class="banner-editor__groups-inner">
            <!-- Background -->
            <BannerEditorBackground
              :fill-type="bgFillType"
              :fill-color="bgFillColor"
              :fill-stops="bgFillStops"
              :fill-angle="bgFillAngle"
              :border="bgBorder"
              :border-color="bgBorderColor"
              :fill-type-options="FILL_TYPE_OPTIONS"
              :fill-type-model="bgFillTypeModel"
              :redraw="redraw"
              :add-stop="addBgStop"
              :remove-stop="removeBgStop"
              :set-stop-color="setBgStopColor"
              :set-stop-position="setBgStopPosition"
              @update:fill-color="bgFillColor = $event"
              @update:fill-angle="bgFillAngle = $event"
              @update:border="bgBorder = $event"
              @update:border-color="bgBorderColor = $event"
              @update:fill-type-model="bgFillTypeModel = $event"
            />

            <!-- Layers -->
            <BannerEditorLayersPanel
              :layers-reversed="layersReversed"
              :selected-layer-id="selectedLayerId"
              @add-text="addTextLayer"
              @add-image="openImagePicker()"
              @select="selectedLayerId = $event; redraw()"
              @move-up="moveLayerUp"
              @move-down="moveLayerDown"
              @duplicate="duplicateLayer"
              @remove="removeLayer"
            />

            <!-- Text layer controls -->
            <BannerEditorTextPanel
              v-if="selectedTextLayer"
              :layer="selectedTextLayer"
              :font-options="fontOptions"
              :font-family-model="fontFamilyModel"
              :font-custom-mode="fontCustomMode"
              :font-family-custom="fontFamilyCustom"
              :fonts-loaded="fontsLoaded"
              :fonts-permission-denied="fontsPermissionDenied"
              :fill-type-options="FILL_TYPE_OPTIONS"
              :fill-type-model="fillTypeModel"
              :text-font-size-min="TEXT_FONT_SIZE_MIN"
              :text-font-size-max="TEXT_FONT_SIZE_MAX"
              :redraw="redraw"
              :add-fill-stop="addSelectedTextFillStop"
              :remove-fill-stop="removeSelectedTextFillStop"
              :set-fill-stop-color="setSelectedTextFillStopColor"
              :set-fill-stop-position="setSelectedTextFillStopPosition"
              @update:font-custom-mode="fontCustomMode = $event"
              @update:font-family-model="fontFamilyModel = $event"
              @update:font-family-custom="fontFamilyCustom = $event"
              @update:fill-type-model="fillTypeModel = $event"
              @update:fill-angle="onTextLayerFillAngle($event)"
              @load-system-fonts="loadSystemFonts()"
            />

            <!-- Image layer controls -->
            <BannerEditorImagePanel
              v-if="selectedImageLayer"
              :layer="selectedImageLayer"
              :redraw="redraw"
              :set-image-x="setImageX"
              :set-image-y="setImageY"
              :set-image-width="setImageWidth"
              :set-image-height="setImageHeight"
              @replace-image="openImagePicker($event)"
              @remove="removeSelectedLayer()"
            />
          </div>

          <!-- Asset path settings + scan -->
          <div class="banner-editor__group banner-editor__group--flat">
            <span class="banner-editor__group-label">Asset paths</span>
            <Flex column gap="s">
              <Checkbox
                v-model="storeAssetPaths"
                label="Store folder path in metadata"
                accent
              />
              <p class="vui-hint" style="opacity: 0.7;">
                When enabled, the source folder and relative path are saved with each layer so you can re-link them later.
              </p>
              <template v-if="hasWebkitDir">
                <Button
                  size="s"
                  variant="gray"
                  expand
                  :loading="scanning"
                  :disabled="missingLayerCount === 0"
                  @click="scanFolder"
                >
                  <template #start>
                    <Icon name="ph:folder-open" class="mr-xs" />
                    {{ missingLayerCount > 0 ? `Scan folder (${missingLayerCount} missing)` : 'No missing images' }}
                  </template>
                </Button>
                <p v-if="scanResult" class="banner-editor__hint">
                  {{ scanResult }}
                </p>
              </template>
            </Flex>
          </div>
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
              size="s"
              plain
              :loading="saving"
              :disabled="!userId || loading"
              @click="deleteBanner"
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              size="s"
              :loading="saving"
              :disabled="!userId || loading"
              @click="saveBanner"
            >
              Save
            <!-- <template #end>
                <Icon name="ph:arrow-right" />
              </template> -->
            </Button>
          </Flex>
        </div>
      </div>
    </div>
    <ConfirmModal
      v-model:open="showDiscardConfirm"
      title="Discard changes?"
      description="You have unsaved changes. They will be lost if you close the editor."
      confirm-text="Discard"
      cancel-text="Keep editing"
      destructive
      @confirm="emit('close')"
    />
  </Modal>
</template>

<style lang="scss">
@font-face {
  font-family: 'Visitor BRK';
  src: url('/fonts/visitorbrk.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

// Not scoped — mirrors the ThemeEditor pattern so we can target Modal internals
.banner-editor {
  // ── Two-column full-screen layout ──────────────────────────────────────────

  --height: 100vh;
  --width: 100vw;

  .vui-card-content {
    padding: 0;
    height: 100%;
    overflow: hidden;
  }

  &__layout {
    display: grid;
    grid-template-columns: 1fr 360px;
    height: 100vh;
    width: 100%;
    overflow: hidden;
  }

  // ── Left: canvas preview ───────────────────────────────────────────────────

  &__preview-area {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: stretch;
    gap: 0;
    padding: 0;
    background-color: transparent;
    overflow: hidden;

    &:focus {
      outline: none;
    }
  }

  &__canvas-scroll {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__workspace {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__canvas-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  &__canvas {
    // cursor is set dynamically via :style binding
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
  }

  &__zoom-bar {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-m);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  &__zoom-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  &__zoom-range {
    flex: 1;
  }

  &__zoom-reset {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    padding: 2px var(--space-xs);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      border-color var(--transition),
      color var(--transition);

    &:hover {
      border-color: var(--color-border-strong);
      color: var(--color-text);
    }
  }

  &__canvas-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    text-align: center;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    overflow-y: scroll;
    overflow-x: hidden;
    min-height: 0;
    min-width: 0;
    height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
  }

  &__groups-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    padding: var(--space-s);
  }

  &__group {
    padding: var(--space-m);
    min-width: 0;
    background-color: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);

    &--flat {
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
    }
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

  &__sub-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    gap: var(--space-xxs);
  }

  &__field-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 42px;
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

  &__gradient-preview {
    flex: 1;
    height: 24px;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--color-border);
    min-width: 0;
  }

  &__stops {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  &__stop-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);

    &--path {
      font-family: monospace;
      word-break: break-all;
    }
  }

  &__checkbox {
    accent-color: var(--color-accent);
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    cursor: pointer;
  }

  &__transform-grid {
    display: grid;
    grid-template-columns: 16px 1fr 16px 1fr;
    align-items: center;
    gap: var(--space-xs);
  }

  &__num-input {
    width: 100%;
    min-width: 0;
    background: var(--color-bg-medium);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    color: var(--color-text);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    padding: 2px var(--space-xs);
    height: 26px;
    text-align: center;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }

    // Hide browser spin buttons - the value is readable enough without them
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
    }
    -moz-appearance: textfield;
    appearance: textfield;
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
