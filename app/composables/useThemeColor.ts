import { parseColor } from '@/lib/globe/GlobeTheme'

// Shared theme-color reader for the canvas audio visuals. All three visualizers
// were duplicating the same getComputedStyle + parseColor dance with a fallback,
// so it lives here once. parseColor handles whatever a custom theme resolves to
// (hex, rgb, oklch, ...), and we fall back when the property is empty or we're on
// the server.

type Rgb = [number, number, number]

// Read a CSS custom property as an [r, g, b] triple. parseColor returns 0-255;
// pass `normalized` to get 0-1 instead (the smoke field wants that, the canvas
// 2d viz want 0-255). Falls back to `fallback` (given in the same range you ask
// for) when the property is empty or we're rendering on the server.
export function readThemeColor(name: string, fallback: Rgb, opts?: { normalized?: boolean }): Rgb {
  if (!import.meta.client)
    return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw)
    return fallback
  const [r, g, b] = parseColor(raw)
  if (opts?.normalized)
    return [r / 255, g / 255, b / 255]
  return [r, g, b]
}
