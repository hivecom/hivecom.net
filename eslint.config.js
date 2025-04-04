import antfu from '@antfu/eslint-config'
import pluginVue from 'eslint-plugin-vue'

export default antfu({
  ...pluginVue.configs['flat/recommended'],
  rules: {
    'no-console': 'warn',
    'curly': 'error',
  },
  formatters: {
    vue: true,
    css: true,
    markdown: true,
    html: true,
  },
})
