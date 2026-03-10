import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  // Global rules
  rules: {
    'unicorn/prefer-node-protocol': 'off',
    'node/prefer-global/process': 'off',
    'ts/no-explicit-any': 'error',
    'n/prefer-global/process': 'off',
  },
  ignores: [
    'package.json',
    'package-lock.json',
    '**/supabase/functions/**/*.ts',
    '**/hash.js',
  ],
  // Add additional configurations for specific file patterns
  formatters: {
    vue: true,
    css: true,
    scss: true,
    markdown: true,
    html: true,
  },
}, {
  // Scope vue rules to Vue files only - applying them globally (e.g. to .md)
  // causes crashes because getTemplateBodyTokenStore() only exists in Vue contexts.
  files: ['**/*.vue'],
  rules: {
    'vue/object-property-newline': ['error', {
      allowAllPropertiesOnSameLine: false,
    }],
  },
}, {
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    'ts/prefer-nullish-coalescing': 'error',
  },
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
})
