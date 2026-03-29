import { vi } from 'vitest'

const MAX_TEXTURE_SIZE = 0x0d33
const UNMASKED_RENDERER_WEBGL = 0x9246

export interface MockWebGLContextOptions {
  renderer?: string
  maxTextureSize?: number
  hasDebugRendererInfo?: boolean
  hasInstancedArrays?: boolean
}

export const createMockWebGLContext = (
  options: MockWebGLContextOptions = {}
): Record<string, unknown> => {
  const {
    renderer = 'Mock GPU Renderer',
    maxTextureSize = 4096,
    hasDebugRendererInfo = true,
    hasInstancedArrays = true
  } = options

  const debugRendererInfo = { UNMASKED_RENDERER_WEBGL }

  const getExtension = vi.fn((name: string) => {
    if (name === 'WEBGL_debug_renderer_info') {
      return hasDebugRendererInfo ? debugRendererInfo : null
    }

    if (name === 'ANGLE_instanced_arrays') {
      return hasInstancedArrays ? {} : null
    }

    return null
  })

  const getParameter = vi.fn((parameter: number) => {
    if (parameter === MAX_TEXTURE_SIZE) {
      return maxTextureSize
    }

    if (parameter === UNMASKED_RENDERER_WEBGL) {
      return renderer
    }

    return null
  })

  return {
    MAX_TEXTURE_SIZE,
    getExtension,
    getParameter
  }
}
