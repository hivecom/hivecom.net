import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    'no-console': 'warn',
    'curly': 'error',
  },
  formatters: {
    css: true,
    markdown: true,
    html: true,
  },
})
