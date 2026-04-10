export interface GradientStop {
  color: string
  /** 0–1 */
  position: number
}

export type FillType = 'solid' | 'linear' | 'radial' | 'conic'

export interface TextLayer {
  id: string
  type: 'text'
  content: string
  fontFamily: string
  /** Capped between TEXT_FONT_SIZE_MIN and TEXT_FONT_SIZE_MAX */
  fontSize: number
  fillType: FillType
  /** Primary / solid color; also the first gradient stop default */
  fillColor: string
  /** Gradient stops - used when fillType != 'solid' */
  fillStops: GradientStop[]
  /** Angle in degrees for linear and conic gradients */
  fillAngle: number
  /** 0–1 */
  opacity: number
  /** Rotation in degrees, clockwise */
  rotation: number
  x: number
  y: number
  bold: boolean
  italic: boolean
  outline: boolean
  outlineColor: string
  /** Stroke width in pixels */
  outlineWidth: number
  shadow: boolean
  shadowColor: string
  /** Blur radius in pixels */
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
}

export interface ImageAssetMeta {
  originalName: string
  size: number | null
  type: string | null
  lastModified: number | null
  /** Base name of the source folder, stored only when the user opts in */
  folderName: string | null
  /** Path relative to the folder root (e.g. "sub/image.png"), stored only when the user opts in */
  folderRelativePath: string | null
}

export interface ImageLayer {
  id: string
  type: 'image'
  /** Object URL for local preview; empty string when restored from metadata */
  src: string
  /** Raw file when freshly added; null when restored from metadata */
  file: File | null
  assetMeta: ImageAssetMeta
  /** Rotation in degrees, clockwise */
  rotation: number
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
  // Legacy fields (v3 and below) - kept for backward-compat reads
  color?: string
  gradientColor?: string | null
  gradientAngle?: number
  // Current fill system
  fillType?: FillType
  fillColor?: string
  fillStops?: GradientStop[]
  fillAngle?: number
  opacity?: number
  rotation?: number
  x: number
  y: number
  bold: boolean
  italic: boolean
  outline?: boolean
  outlineColor?: string
  outlineWidth?: number
  shadow?: boolean
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
}

export interface MetadataImageLayer {
  id: string
  type: 'image'
  rotation?: number
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
  version: 2 | 3 | 4
  creatorId?: string
  background: {
    // Legacy fields (v3 and below)
    type?: 'solid' | 'gradient'
    color?: string
    gradientEnd?: string
    gradientAngle?: number
    // Current fill system
    fillType?: FillType
    fillColor?: string
    fillStops?: GradientStop[]
    fillAngle?: number
    border?: boolean
    borderColor?: string
  }
  layers: MetadataLayer[]
}

export interface SelectOption<T extends string = string> {
  label: string
  value: T
}
