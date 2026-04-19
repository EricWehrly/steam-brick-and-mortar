import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'test/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        CustomEvent: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        performance: 'readonly',
        createImageBitmap: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        Worker: 'readonly',
        self: 'readonly',
        // WebXR globals
        XRSession: 'readonly',
        XRFrame: 'readonly',
        XRReferenceSpace: 'readonly',
        XRInputSource: 'readonly',
        XRViewerPose: 'readonly',
        XRWebGLLayer: 'readonly',
        // Node globals for tests
        process: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Discourage inline dynamic imports in favour of top-of-file static imports.
      // Dynamic import() is fine for code-splitting; using it just to defer a
      // module that could be imported statically is an antipattern.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'ImportExpression',
          message: 'Prefer static top-of-file imports over inline import(). Use dynamic import only for genuine code-splitting.',
        },
      ],

      // Error prevention (the important stuff)
      'no-unused-vars': 'off', // TypeScript handles this better
      '@typescript-eslint/no-unused-vars': ['warn', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      
      // TypeScript-specific issue catching
      '@typescript-eslint/no-explicit-any': 'warn', // Allow any but warn about it
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // prefer-nullish-coalescing requires strictNullChecks; off until tsconfig strict is enabled.
      // TD: re-enable once strictNullChecks is on
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      
      // Code quality without being overly strict
      'prefer-const': 'warn',
      'no-var': 'error',
      'curly': 'off', // Disable curly brace enforcement for now
      
      // Disable overly strict rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  {
    // Test files can be more relaxed
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]
