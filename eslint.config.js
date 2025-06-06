import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  // Global rules
  rules: {
    'unicorn/prefer-node-protocol': 'off',
    'node/prefer-global/process': 'off',
    'n/prefer-global/process': 'off',
    // Override the problematic vue/object-property-newline rule
    'vue/object-property-newline': ['error', {
      allowAllPropertiesOnSameLine: false,
    }],
  },
  ignores: [
    'package.json',
    'package-lock.json',
    '**/supabase/functions/**/*.ts',
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
  // Create a separate config for Supabase functions with disabled no-console rule
  files: ['**/supabase/functions/**/*.ts'],
  rules: {
    'no-console': 'off',
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
