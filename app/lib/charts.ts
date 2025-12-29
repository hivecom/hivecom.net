import type { ChartOptions } from 'chart.js'
import { getCSSVariable } from './utils/common'

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
          color: getCSSVariable(`--${theme}-color-border-weak`),
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: {
          color: getCSSVariable(`--${theme}-color-border-weak`),
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
