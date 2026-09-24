import { cssVar } from '@/lib/cssVar'
import { parseColor } from '@/lib/globe/GlobeTheme'

type Rgb = [number, number, number]

// 0-255 by default, 0-1 with `normalized`. parseColor handles whatever a custom
// theme resolves to (hex, rgb, oklch). fallback is given in the requested range
// and used when the property is empty or on the server.
export function readThemeColor(name: string, fallback: Rgb, opts?: { normalized?: boolean }): Rgb {
  if (!import.meta.client)
    return fallback

  const raw = cssVar(name)
  if (!raw)
    return fallback

  const [r, g, b] = parseColor(raw)
  if (opts?.normalized)
    return [r / 255, g / 255, b / 255]

  return [r, g, b]
}
