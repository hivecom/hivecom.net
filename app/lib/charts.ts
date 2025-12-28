import type { ChartOptions } from 'chart.js'

export const lineChartDefaultOptions: ChartOptions<'line'> = {
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
        color: '#181818',
      },
    },
    y: {
      type: 'linear',
      display: true,
      position: 'left',
      beginAtZero: true,
      grid: {
        color: '#181818',
      },
    },
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
}
