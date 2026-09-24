import type { Chart, ChartOptions, Plugin, TooltipItem, TooltipModel } from 'chart.js'
import { parseColor } from './globe/GlobeTheme'
import { getCSSVariable } from './utils/common'
import 'chartjs-scale-timestack'

/**
 * Resolved --color-* tokens, which VUI keeps in sync with the active theme.
 * The chart wrapper's :key="theme" remounts on a theme switch so these get
 * re-read.
 */
export interface ChartPalette {
  grid: string

  text: string

  textLight: string

  textLighter: string

  /** Index by dataset position. */
  datasets: string[]
}

/** Returns [hue 0-360, saturation 0-100, lightness 0-100]. */
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
 * Tokens aren't guaranteed to be hex (some are overridden with rgb()), so a
 * hex alpha suffix can produce an invalid colour that Chart.js renders black.
 */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Falls back to green during SSR.
function getAccentHue(): number {
  const raw = getCSSVariable('--color-accent')
  if (!raw)
    return 120

  const [r, g, b] = parseColor(raw)
  const [h] = rgbToHsl(r, g, b)
  return h
}

/**
 * `count` hues spread evenly around the wheel, starting from the accent hue.
 * `alpha` is two hex digits, so "cc" is ~80%.
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

// Call at mount, not module load, so the DOM has the active theme applied.
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
      getCSSVariable('--color-text-purple'),
    ],
  }
}

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

    let x = tooltip.caretX - elWidth / 2
    let y = tooltip.caretY - elHeight - 12

    if (x < 0)
      x = 4
    if (x + elWidth > canvasRect.width)
      x = canvasRect.width - elWidth - 4

    // Short charts can't fit a multi-row tooltip above the caret, and flipping
    // it below can spill out over the content underneath. Flip only when there's
    // room, otherwise clamp inside the canvas.
    if (y < 0) {
      const below = tooltip.caretY + 12
      y = below + elHeight <= canvasRect.height
        ? below
        : Math.max(4, canvasRect.height - elHeight - 4)
    }

    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }
}

/**
 * @deprecated Pass no arguments. `_theme` is a no-op.
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

// A bar datapoint is a number, null, or an `{x, y}` point.
function barPointY(value: unknown): number | null {
  if (value !== null && typeof value === 'object' && 'y' in value)
    return (value as { x: number, y: number | null }).y

  return value as number | null
}

function barPointX(point: unknown): number | null {
  if (point !== null && typeof point === 'object' && 'x' in point) {
    const x = point.x
    return typeof x === 'number' ? x : null
  }

  return null
}

/**
 * Shades bar columns where every dataset is null. It has to be every dataset:
 * the stacked per-server charts have one dataset per server, and one missing
 * server isn't a gap.
 */
export const barGapPlugin: Plugin<'bar'> = {
  id: 'barGapPlugin',
  afterDatasetsDraw(chart: Chart<'bar'>) {
    const pluginOpts = (chart.options as unknown as { plugins?: { barGapPlugin?: { enabled?: boolean } } }).plugins?.barGapPlugin
    if (pluginOpts?.enabled === false)
      return

    const datasets = chart.data.datasets
    if (!datasets.length)
      return

    const ctx = chart.ctx
    const xAxis = chart.scales.x
    const yAxis = chart.scales.y
    if (!xAxis || !yAxis)
      return

    // A series the user hid shouldn't make a column count as a gap.
    const visible = datasets
      .map((dataset, i) => ({ dataset, index: i }))
      .filter(({ index }) => chart.isDatasetVisible(index))
    if (!visible.length)
      return

    const pointCount = Math.max(...visible.map(({ dataset }) => dataset.data.length))
    const color = getCSSVariable('--color-border')
    const top = yAxis.top
    const bottom = yAxis.bottom
    const height = bottom - top
    const now = Date.now()

    ctx.save()
    ctx.fillStyle = withAlpha(color, 0x44 / 255)

    for (let index = 0; index < pointCount; index++) {
      const isGap = visible.every(({ dataset }) => barPointY(dataset.data[index]) === null)
      if (!isGap)
        continue

      // A future bucket isn't missing data. futureShadePlugin covers it.
      const bucketStart = visible
        .map(({ dataset }) => barPointX(dataset.data[index]))
        .find(x => x !== null)
      if (bucketStart !== undefined && bucketStart > now)
        continue

      // Stacked datasets share an x position, so any visible one will do.
      let bar: { x: number, width?: number } | undefined
      for (const { index: datasetIndex } of visible) {
        const candidate = chart.getDatasetMeta(datasetIndex).data[index] as unknown as { x: number, width?: number } | undefined
        if (candidate) {
          bar = candidate
          break
        }
      }
      if (!bar)
        continue

      // bar.width is Chart.js internal layout.
      const barWidth = bar.width ?? xAxis.width / pointCount
      const x = bar.x - barWidth / 2

      ctx.fillRect(x, top, barWidth, height)
    }

    ctx.restore()
  },
}

// Must agree with barGapPlugin on which columns are gaps.
export function barGapTooltipText(items: TooltipItem<'bar'>[]): string {
  const allNull = items.every(item => barPointY(item.raw) === null)
  if (!allNull)
    return ''

  const bucketStart = items.map(item => barPointX(item.raw)).find(x => x !== null)
  if (bucketStart !== undefined && bucketStart > Date.now())
    return ''

  return 'No data was collected for this period - collection may not have started yet or encountered an error.'
}

/**
 * Dims the future part of a time axis and marks the present. Windows are
 * whole days, so a chart opened mid-day otherwise shows hours of empty columns
 * that read as missing data.
 */
export const futureShadePlugin: Plugin<'bar'> = {
  id: 'futureShadePlugin',
  afterDatasetsDraw(chart: Chart<'bar'>) {
    const xAxis = chart.scales.x
    const yAxis = chart.scales.y
    if (!xAxis || !yAxis)
      return

    const now = Date.now()
    if (now >= xAxis.max)
      return

    const nowX = now <= xAxis.min ? xAxis.left : xAxis.getPixelForValue(now)
    const top = yAxis.top
    const height = yAxis.bottom - top
    const ctx = chart.ctx

    ctx.save()

    ctx.fillStyle = withAlpha(getCSSVariable('--color-bg-raised') || getCSSVariable('--color-border'), 0.35)
    ctx.fillRect(nowX, top, xAxis.right - nowX, height)

    if (now > xAxis.min) {
      ctx.strokeStyle = withAlpha(getCSSVariable('--color-text-lighter'), 0.8)
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(nowX, top)
      ctx.lineTo(nowX, top + height)
      ctx.stroke()
    }

    ctx.restore()
  },
}

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
