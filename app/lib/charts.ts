import type { ChartOptions } from 'chart.js'
import { getCSSVariable } from './utils/common'

/**
 * Returns the CSS variable value for a chart grid line color given the current
 * VUI theme name (e.g. "light" or "dark").
 *
 * The theme prefix convention (`--${theme}-color-border-weak`) is documented
 * here so callers don't need to reconstruct it manually.
 */
export function getChartGridColor(theme: string): string {
  return getCSSVariable(`--${theme}-color-border-weak`)
}

export function getLineChartDefaults(theme: string): ChartOptions<'line'> {
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
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxHeight: 10,
          boxWidth: 10,
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: getChartGridColor(theme),
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: {
          color: getChartGridColor(theme),
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
