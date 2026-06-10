import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'node_modules/**',
      'explorer/node_modules/**',
      'explorer/dist/**',
      '.playwright-browsers/**',
      'output/**',
      'explorer/public/*.json',
      'taxonomy/verticals.json',
    ],
  },

  // Backend / pipeline scripts (Node ESM)
  {
    files: ['**/*.{js,mjs}'],
    ignores: ['explorer/**'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Explorer frontend (TypeScript + React, browser)
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['explorer/src/**/*.{ts,tsx}'],
    languageOptions: {
      ...config.languageOptions,
      globals: { ...globals.browser },
    },
  })),
  {
    files: ['explorer/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
