import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import astro from 'eslint-plugin-astro';
import astroParser from 'astro-eslint-parser';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  HTMLElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  CanvasRenderingContext2D: 'readonly',
  MouseEvent: 'readonly',
  KeyboardEvent: 'readonly',
  Event: 'readonly',
  FormData: 'readonly',
  ResizeObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  performance: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  screen: 'readonly',
  React: 'readonly',
  AudioContext: 'readonly',
  OscillatorType: 'readonly',
  Deno: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  fetch: 'readonly',
};

const nodeGlobals = {
  URL: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'readonly',
  global: 'readonly',
};

export default [
  {
    ...js.configs.recommended,
    ignores: ['**/*.astro', 'dist/', 'node_modules/', '.astro/', 'design/'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        parser: tsparser,
        extraFileExtensions: ['.astro'],
      },
    },
    plugins: { astro },
    rules: {
      ...astro.configs.recommended.rules,
    },
  },
  {
    files: ['*.config.ts', '*.config.mjs', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...nodeGlobals, console: 'readonly' },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '.astro/', 'design/', 'supabase/functions/'],
  },
];
