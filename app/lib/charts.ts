import type { Chart, ChartOptions, Plugin } from 'chart.js'
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
  /**
   * Ordered dataset colors. Callers should index into this array by dataset
   * position. Falls back gracefully - the array always has at least 6 entries.
   *
   * Order: blue, green, red, yellow, accent, text-light (neutral)
   */
  datasets: string[]
}

/**
 * Reads the current VUI theme's resolved CSS variables and returns a
 * ChartPalette. Call this at render/mount time (not module load time) so the
 * DOM has applied the active theme.
 */
export function getChartPalette(): ChartPalette {
  return {
    grid: getCSSVariable('--color-border-weak'),
    text: getCSSVariable('--color-text'),
    textLight: getCSSVariable('--color-text-light'),
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
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: palette.grid,
        },
        ticks: {
          color: palette.textLight,
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
          color: palette.textLight,
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
          color: palette.textLight,
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
          color: palette.textLight,
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
