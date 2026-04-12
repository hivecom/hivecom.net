import type { ChartOptions } from 'chart.js'
import { getCSSVariable } from './utils/common'

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
