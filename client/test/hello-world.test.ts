/**
 * Hello World Test - Basic functionality validation
 */

import { describe, it, expect } from 'vitest'

describe('Hello World Tests', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle async operations', async () => {
    const result = await Promise.resolve('hello world')
    expect(result).toBe('hello world')
  })

  it('should validate TypeScript compilation', () => {
    interface TestInterface {
      name: string
      value: number
    }

    const testObj: TestInterface = {
      name: 'test',
      value: 42
    }

    expect(testObj.name).toBe('test')
    expect(testObj.value).toBe(42)
  })
})

describe('WebXR Environment Tests', () => {
  it('should mock navigator.xr availability', () => {
    expect(navigator.xr).toBeDefined()
    expect(typeof navigator.xr.isSessionSupported).toBe('function')
  })

  it('should handle WebXR session support check', async () => {
    const supported = await navigator.xr.isSessionSupported('immersive-vr')
    expect(typeof supported).toBe('boolean')
  })
})

describe('DOM Environment Tests', () => {
  it('should have access to DOM globals in test environment', () => {
    expect(document).toBeDefined()
    expect(window).toBeDefined()
  })

  it('should be able to create DOM elements', () => {
    const div = document.createElement('div')
    div.textContent = 'test element'
    expect(div.textContent).toBe('test element')
  })
})
