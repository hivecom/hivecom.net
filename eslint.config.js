import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  // Zed sets ZED_ENVIRONMENT in the LSP process, which would suppress autofix rules
  isInEditor: false,
  rules: {
    'unicorn/prefer-node-protocol': 'off',
    'node/prefer-global/process': 'off',
    'ts/no-explicit-any': 'error',
    'n/prefer-global/process': 'off',
    // `args: 'none'` because the rule flags parameter names in type signatures,
    // which are documentation only
    'unused-imports/no-unused-vars': ['error', {
      vars: 'all',
      varsIgnorePattern: '^_',
      args: 'none',
      ignoreRestSiblings: true,
    }],
    'ts/strict-boolean-expressions': 'off',
  },
  ignores: [
    'app/global.d.ts',
    'package.json',
    'package-lock.json',
    '**/supabase/functions/**/*.ts',
    'REFACTOR.md',
    '.you/**',
    // Generated
    'types/database.types.ts',
  ],
  formatters: {
    vue: true,
    css: true,
    scss: true,
    markdown: true,
    html: true,
  },
}, {
  // Vue rules crash outside .vue files: getTemplateBodyTokenStore() only exists there
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
