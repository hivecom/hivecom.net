import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  // Force editor detection off so formatting/autofix rules aren't suppressed
  // when ZED_ENVIRONMENT is set in the LSP process
  isInEditor: false,
  // Global rules
  rules: {
    'unicorn/prefer-node-protocol': 'off',
    'node/prefer-global/process': 'off',
    'ts/no-explicit-any': 'error',
    'n/prefer-global/process': 'off',
    // The upgraded @antfu/eslint-config tightened this rule so it flags parameter
    // names inside function *type signatures* (interfaces, callback types, generic
    // constraints). Those names are documentation-only and have no runtime impact.
    // We keep the rule active for real unused vars/args in function bodies, but
    // set `args: 'none'` to stop it from flagging type-position parameter names.
    'unused-imports/no-unused-vars': ['error', {
      vars: 'all',
      varsIgnorePattern: '^_',
      args: 'none',
      ignoreRestSiblings: true,
    }],
  },
  ignores: [
    'package.json',
    'package-lock.json',
    '**/supabase/functions/**/*.ts',
    '**/hash.js',
    'REFACTOR.md',
    '.you/**',
    // Fully generated file - never manually edited, will be overwritten
    'types/database.types.ts',
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
