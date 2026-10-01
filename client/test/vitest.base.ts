import { defineConfig } from 'vitest/config'

/**
 * What every vitest config agrees on. Each config is `mergeConfig(baseConfig, defineConfig({...}))`
 * and states only how it differs.
 *
 * This is a separate file rather than vitest.config.ts itself because mergeConfig CONCATENATES
 * arrays: inheriting vitest.config.ts would hand the integration config that file's exclude list
 * (which names the integration tests) on top of its own, and it would run nothing. So the arrays
 * here (`setupFiles`, `css.include`) are ones every config wants verbatim, and no config may set its
 * own - it would be appended, not replace them.
 *
 * css.include: Vitest blanks every .css file to an empty string by default (so component tests
 * don't pay for CSS they never look at), and that applies to `?raw` imports too. The VR menu's
 * stylesheet is digested from raw text into uikit's style registry, so it must come through intact -
 * otherwise the menu silently has no styles under test. The pattern is deliberately not anchored
 * with `$`: the module id being matched still carries its `?raw` suffix.
 */
export const baseConfig = defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    css: { include: [/src[\\/]styles[\\/]vr-menu\.css/] },
    setupFiles: ['./test/setup.ts'],
    watch: false,
    testTimeout: 30000
  }
})
