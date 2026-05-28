import type { Chart, ChartOptions, Plugin, TooltipModel } from 'chart.js'
import { parseColor } from './globe/GlobeTheme'
import { getCSSVariable } from './utils/common'
import 'chartjs-scale-timestack'

/**
 * Chart color palette derived from VUI theme tokens.
 *
 * These are the resolved --color-* variables (not the prefixed --light-color-*
 * or --dark-color-* variants). VUI keeps them in sync with the active theme,
 * so reading them at render time always gives the correct value. The chart
 * wrapper's :key="theme" forces a remount on theme switch, which re-reads all
 * of these.
 */
export interface ChartPalette {
  /** Grid lines, axis ticks. */
  grid: string
  /** Axis label text. */
  text: string
  /** Muted axis label text. */
  textLight: string
  /** Dimmer axis tick text. */
  textLighter: string
  /**
   * Ordered dataset colors. Callers should index into this array by dataset
   * position. Falls back gracefully - the array always has at least 6 entries.
   *
   * Order: blue, green, red, yellow, accent, text-light (neutral)
   */
  datasets: string[]
}

/**
 * Converts an RGB triplet to HSL. Returns [hue 0-360, saturation 0-100, lightness 0-100].
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min)
    return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn)
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn)
    h = ((bn - rn) / d + 2) / 6
  else
    h = ((rn - gn) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Reads the accent CSS variable and returns its HSL hue (0-360).
 * Falls back to 120 (green) if the variable is unavailable (SSR).
 */
function getAccentHue(): number {
  const raw = getCSSVariable('--color-accent')
  if (!raw)
    return 120
  const [r, g, b] = parseColor(raw)
  const [h] = rgbToHsl(r, g, b)
  return h
}

/**
 * Generates an array of `count` visually distinct colors evenly distributed
 * around the HSL hue wheel, anchored to the VUI accent hue so the palette
 * stays coherent with the active theme.
 *
 * @param count  Number of colors to generate.
 * @param alpha  Opacity as a two-digit hex string (default "cc" = ~80%).
 */
export function getColorizedPalette(count: number, alpha = 'cc'): string[] {
  if (count <= 0)
    return []
  const anchorHue = getAccentHue()
  const alphaPercent = Math.round((Number.parseInt(alpha, 16) / 255) * 100)
  return Array.from({ length: count }, (_, i) => {
    const hue = (anchorHue + Math.round((i / count) * 360)) % 360
    return `hsl(${hue} 70% 58% / ${alphaPercent}%)`
  })
}

/**
 * Reads the current VUI theme's resolved CSS variables and returns a
 * ChartPalette. Call this at render/mount time (not module load time) so the
 * DOM has applied the active theme.
 */
export function getChartPalette(): ChartPalette {
  return {
    grid: getCSSVariable('--color-border'),
    text: getCSSVariable('--color-text'),
    textLight: getCSSVariable('--color-text-light'),
    textLighter: getCSSVariable('--color-text-lighter'),
    datasets: [
      getCSSVariable('--color-text-blue'),
      getCSSVariable('--color-text-green'),
      getCSSVariable('--color-text-red'),
      getCSSVariable('--color-text-yellow'),
      getCSSVariable('--color-accent'),
      getCSSVariable('--color-text-lighter'),
    ],
  }
}

/**
 * External tooltip handler that renders a VUI-styled tooltip DOM element
 * positioned over the chart canvas. Matches --color-bg-raised, --box-shadow,
 * --border-radius-s, --font-size-s, and --color-text tokens from VUI.
 */
export function createVuiTooltipHandler() {
  return function (context: { chart: Chart, tooltip: TooltipModel<'bar' | 'line'> }) {
    const { chart, tooltip } = context

    let el = chart.canvas.parentElement?.querySelector<HTMLDivElement>('.chartjs-vui-tooltip')

    if (!el) {
      el = document.createElement('div')
      el.className = 'chartjs-vui-tooltip'
      chart.canvas.parentElement?.appendChild(el)
    }

    if (tooltip.opacity === 0) {
      el.style.opacity = '0'
      return
    }

    // Build inner HTML
    const titleLines = tooltip.title ?? []
    const bodyLines = tooltip.body?.map(b => b.lines) ?? []

    let html = ''

    if (titleLines.length) {
      html += `<div class="chartjs-vui-tooltip__title">${titleLines.join('<br>')}</div>`
    }

    bodyLines.forEach((lines, i) => {
      const ds = tooltip.dataPoints?.[i]
      const color = (tooltip.labelColors?.[i]?.backgroundColor as string | undefined) ?? 'transparent'
      lines.forEach((line) => {
        if (!line)
          return
        const swatch = ds
          ? `<span class="chartjs-vui-tooltip__swatch" style="background:${color}"></span>`
          : ''
        html += `<div class="chartjs-vui-tooltip__row">${swatch}${line}</div>`
      })
    })

    // Afterbody (e.g. "No data" messages)
    const afterBody = tooltip.afterBody ?? []
    if (afterBody.length) {
      afterBody.forEach((line) => {
        if (line)
          html += `<div class="chartjs-vui-tooltip__after">${line}</div>`
      })
    }

    el.innerHTML = html
    el.style.opacity = '1'

    const canvasRect = chart.canvas.getBoundingClientRect()
    const elWidth = el.offsetWidth
    const elHeight = el.offsetHeight

    // Position: prefer above the caret, clamp inside canvas
    let x = tooltip.caretX - elWidth / 2
    let y = tooltip.caretY - elHeight - 12

    if (x < 0)
      x = 4
    if (x + elWidth > canvasRect.width)
      x = canvasRect.width - elWidth - 4
    if (y < 0)
      y = tooltip.caretY + 12

    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }
}

/**
 * Returns Chart.js line chart defaults wired to the current VUI theme.
 *
 * The `theme` parameter is no longer used for color resolution - colors come
 * from the resolved --color-* tokens via getChartPalette(). It is kept as an
 * optional parameter for call-site compatibility (existing callers pass
 * `theme` from VUI) and may be removed in a future cleanup.
 *
 * @deprecated Pass no arguments. The `_theme` param is a no-op and will be
 * removed once all call sites are updated.
 */
export function getLineChartDefaults(_theme?: string): ChartOptions<'line'> {
  const palette = getChartPalette()

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 50,
      delay: 0,
    },
    plugins: {
      title: {
        display: true,
        color: palette.text,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: palette.text,
          boxHeight: 10,
          boxWidth: 10,
        },
      },
      tooltip: {
        enabled: false,
        external: createVuiTooltipHandler(),
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: palette.grid,
        },
        ticks: {
          color: palette.textLighter,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: {
          color: palette.grid,
        },
        ticks: {
          color: palette.textLighter,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  }
}

/**
 * Chart.js plugin that draws a faint fill over bar chart columns where the
 * first dataset has a null y-value, visually indicating a data gap without
 * polluting the legend or tooltip with an extra dataset.
 *
 * Supports both plain `null` values and `{x, y}` point objects.
 *
 * Register once globally before mounting any bar charts:
 *   ChartJS.register(barGapPlugin)
 */
export const barGapPlugin: Plugin<'bar'> = {
  id: 'barGapPlugin',
  afterDatasetsDraw(chart: Chart<'bar'>) {
    // Allow per-chart opt-out via options.plugins.barGapPlugin = { enabled: false }
    const pluginOpts = (chart.options as unknown as { plugins?: { barGapPlugin?: { enabled?: boolean } } }).plugins?.barGapPlugin
    if (pluginOpts?.enabled === false)
      return

    const dataset = chart.data.datasets[0]
    if (!dataset)
      return

    const ctx = chart.ctx
    const xAxis = chart.scales.x
    const yAxis = chart.scales.y
    if (!xAxis || !yAxis)
      return

    const color = getCSSVariable('--color-border')
    const top = yAxis.top
    const bottom = yAxis.bottom
    const height = bottom - top

    ctx.save()
    ctx.fillStyle = `${color}44`

    dataset.data.forEach((value, index) => {
      // Support both plain null values and {x, y} point objects
      const yVal = (value !== null && typeof value === 'object' && 'y' in value)
        ? (value as unknown as { x: number, y: number | null }).y
        : value as number | null
      if (yVal !== null)
        return

      const meta = chart.getDatasetMeta(0)
      const bar = meta.data[index]
      if (!bar)
        return

      // bar.width comes from Chart.js internal layout
      const barWidth = (bar as unknown as { width: number }).width ?? xAxis.width / dataset.data.length
      const x = bar.x - barWidth / 2

      ctx.fillRect(x, top, barWidth, height)
    })

    ctx.restore()
  },
}

/**
 * Returns Chart.js bar chart defaults wired to the current VUI theme.
 * Uses the timestack x-axis for clean human-readable time labels.
 * Legend and axis titles are hidden - keep charts minimal.
 */
export function getBarChartDefaults(useUtc = false): ChartOptions<'bar'> {
  const palette = getChartPalette()
  const borderRadius = Number.parseInt(getCSSVariable('--border-radius-xs') || '3', 10)

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 50,
      delay: 0,
    },
    plugins: {
      title: {
        display: false,
      },
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
        external: createVuiTooltipHandler(),
      },
    },
    scales: {
      x: {
        type: 'timestack' as 'category',
        display: true,
        offset: false,
        ...(useUtc ? { timestack: { datetime: { zone: 'UTC' } } } : {}),
        grid: {
          color: palette.grid,
        },
        ticks: {
          color: palette.textLighter,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: {
          color: palette.grid,
        },
        ticks: {
          color: palette.textLighter,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
    elements: {
      bar: {
        borderRadius,
        borderSkipped: false,
      },
    },
  }
}
