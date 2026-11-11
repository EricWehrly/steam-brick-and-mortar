import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

const IMPORT_SELECTORS = [
  {
    selector: 'ImportExpression',
    message: 'Prefer static top-of-file imports over inline import(). Use dynamic import only for genuine code-splitting.',
  },
  {
    selector: 'TSImportType',
    message: 'Prefer top-of-file type imports over inline import(\'...\').Type queries.',
  },
]

const LEGACY_DOM_PANELS = [
  'src/ui/pause/panels/ApplicationPanel.ts',
  'src/ui/pause/panels/CameraSettingsPanel.ts',
  'src/ui/pause/panels/DisplayAdvancedPanel.ts',
  'src/ui/pause/panels/GameSettingsPanel.ts',
  'src/ui/pause/panels/GraphicsSettingsPanel.ts',
]

// Pure selectors (map/filter/...) are the one place an inline lambda reads fine.
const PURE_SELECTOR_CALLEE = '/^(map|flatMap|filter|find|findIndex|some|every|sort|reduce|replace|forEach|traverse)$/'
const ANONYMOUS_FUNCTION = ':matches(ArrowFunctionExpression, FunctionExpression[id=null])'
const CALLBACK_MESSAGE = 'Name this callback (const/function/bound method) so the code says what it does. Inline lambdas are fine only as pure map/filter/find/sort/reduce selectors.'
const CALLBACK_SELECTORS = [
  { selector: `:matches(CallExpression, NewExpression):not([callee.property.name=${PURE_SELECTOR_CALLEE}]):not(NewExpression[callee.name=Promise]) > ${ANONYMOUS_FUNCTION}.arguments`, message: CALLBACK_MESSAGE },
  { selector: `ObjectExpression > Property[kind="init"][method=false] > ${ANONYMOUS_FUNCTION}.value`, message: CALLBACK_MESSAGE },
  { selector: `AssignmentExpression > ${ANONYMOUS_FUNCTION}.right`, message: CALLBACK_MESSAGE },
]

const SINGLETONS = '/^(EventManager|AppSettings|DataManager)$/'
const SINGLETON_TYPE = `[typeAnnotation.typeAnnotation.typeName.name=${SINGLETONS}]`
const SINGLETON_MESSAGE = 'EventManager/AppSettings/DataManager are singletons: call getInstance() where it is used instead of threading it through parameters.'
const SINGLETON_PARAM_SELECTORS = [
  `:function > Identifier.params${SINGLETON_TYPE}`,
  `:function > AssignmentPattern.params > Identifier.left${SINGLETON_TYPE}`,
  `:function > TSParameterProperty.params > Identifier.parameter${SINGLETON_TYPE}`,
  `:function > TSParameterProperty.params > AssignmentPattern.parameter > Identifier.left${SINGLETON_TYPE}`,
].map(selector => ({ selector, message: SINGLETON_MESSAGE }))

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
      'no-restricted-syntax': ['warn', ...IMPORT_SELECTORS],

      // Error prevention (the important stuff)
      'no-unused-vars': 'off', // TypeScript handles this better
      '@typescript-eslint/no-unused-vars': ['warn', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      // tsc owns undefined-identifier checks for TS; core no-undef doesn't know DOM/XR lib types
      'no-undef': 'off',
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
    // Production code must not depend on test code (tsc and Vite would both accept it).
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/test/**', '**/tests/**'],
          message: 'src/ must not import from test/. Move shared code into src/, or keep the test helper test-only.',
        }],
      }],
    },
  },
  {
    // Review rules from PRs #171/#172. Replaces the block above for src/, so it repeats the import selectors.
    // Test files are exempt: describe/it callbacks are meant to be anonymous.
    // Legacy DOM pause-menu panels are exempt until dom-menu-panel-retirement removes them.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: LEGACY_DOM_PANELS,
    rules: {
      'no-restricted-syntax': ['warn', ...IMPORT_SELECTORS, ...CALLBACK_SELECTORS, ...SINGLETON_PARAM_SELECTORS],
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
