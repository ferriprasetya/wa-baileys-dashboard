import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global Ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'drizzle/**'],
  },

  // Base Configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project Specific Rules
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
    },
  },

  // Prettier Config
  prettierConfig,
]
