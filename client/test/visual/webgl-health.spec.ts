import { test, expect } from '@playwright/test'
import { attachConsoleCollector } from './helpers/scene'

/**
 * WebGL Context Health Check
 *
 * Fast pre-flight check: verifies that a WebGL context can be created at all.
 * Does NOT wait for scene ready — this is intentionally a quick smoke test that
 * fails immediately if WebGL init is broken (e.g. driver exhausted, ANGLE failure,
 * headless config issue).
 *
 * Why this exists: startup tests like waitForSceneReady() have a fallback that
 * passes if the canvas exists with non-zero dimensions — they won't catch a
 * silent WebGL creation failure. This test does.
 *
 * Catches errors like:
 *   THREE.WebGLRenderer: A WebGL context could not be created.
 *   Reason: FEATURE_FAILURE_EGL_NO_CONFIG / FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS
 *
 * Run: yarn test:visual --grep "webgl health"
 */
test('webgl health', async ({ page }) => {
  const entries = attachConsoleCollector(page)

  await page.goto('/')

  // Give the renderer just enough time to attempt context creation — no need to
  // wait for the full scene. Context creation is synchronous at construction time.
  await page.waitForTimeout(3000)

  // Check for known fatal WebGL errors in console output
  const webglErrors = entries.filter(e =>
    (e.type === 'error' || e.type === 'pageerror' || e.type === 'warning') &&
    (
      e.text.includes('WebGL context could not be created') ||
      e.text.includes('FEATURE_FAILURE_WEBGL') ||
      e.text.includes('FEATURE_FAILURE_EGL') ||
      e.text.includes('Exhausted GL driver') ||
      e.text.includes('WebGL is not supported') ||
      e.text.includes('WebGLRenderer: Error creating WebGL context')
    )
  )

  // Also verify the canvas actually exists and has a WebGL context
  const contextStatus = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { hasCanvas: false, hasContext: false, width: 0, height: 0 }
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
    return {
      hasCanvas: true,
      hasContext: gl !== null,
      width: canvas.width,
      height: canvas.height,
    }
  })

  if (webglErrors.length > 0) {
    console.log('\nWebGL errors detected:')
    webglErrors.forEach(e => console.log(`  [${e.type}] ${e.text}`))
  }

  // Assertions
  expect(contextStatus.hasCanvas, 'Canvas element must exist').toBe(true)
  expect(contextStatus.hasContext, 'WebGL context must be obtainable on the canvas').toBe(true)
  expect(webglErrors, `WebGL creation errors in console:\n${webglErrors.map(e => e.text).join('\n')}`).toHaveLength(0)
})
