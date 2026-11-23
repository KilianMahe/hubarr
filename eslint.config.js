// SPDX-License-Identifier: AGPL-3.0-or-later
// Configuration ESLint (flat config) du monorepo : typescript-eslint en mode
// type-checked strict, eslint-plugin-vue, désactivation des règles de mise en
// forme (Prettier s'en charge) et contrôle de l'en-tête SPDX (CLAUDE.md).

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import iconButtonLabel from './tools/eslint/icon-button-label.js';
import noRawText from './tools/eslint/no-raw-text.js';
import spdxHeader from './tools/eslint/spdx-header.js';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      'data-dev/',
      'pnpm-lock.yaml',
      'docs/.vitepress/cache/',
      // Artefacts Playwright (make e2e).
      'e2e/playwright/test-results/',
      'e2e/playwright/playwright-report/',
      // Types générés depuis OpenAPI (make openapi) : en-tête SPDX posé par le générateur.
      'apps/server/src/integrations/*/openapi.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...vue.configs['flat/recommended'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      hubarr: {
        rules: {
          'spdx-header': spdxHeader,
          'no-raw-text': noRawText,
          'icon-button-label': iconButtonLabel,
        },
      },
    },
    rules: {
      'hubarr/spdx-header': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: globals.browser,
    },
  },

  {
    files: ['apps/web/src/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },

  // Aucun texte en dur dans les templates du front (P5.4, CLAUDE.md).
  {
    files: ['apps/web/src/**/*.vue'],
    rules: { 'hubarr/no-raw-text': 'error', 'hubarr/icon-button-label': 'error' },
  },

  // Scripts servis tels quels au navigateur (sans bundle).
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },

  {
    files: ['apps/server/**/*.ts', 'tools/**/*.js', '*.js'],
    languageOptions: { globals: globals.node },
  },

  // Fastify attend des plugins, hooks et handlers `async` (sinon : callback
  // `done`, ou `reply.send` obligatoire) : un `async` sans `await` y est la norme.
  {
    files: ['apps/server/**/*.ts', 'e2e/mocks/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  // Fichiers JavaScript (configuration, outils) : hors projet TypeScript.
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
