import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TextureManager } from '../../src/utils/TextureManager'

describe('TextureManager API Integration Tests', () => {
  let textureManager: TextureManager

  beforeEach(() => {
    // Mock canvas for texture creation
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue({
        createTexture: vi.fn(),
        bindTexture: vi.fn(),
        texImage2D: vi.fn(),
        texParameteri: vi.fn(),
        generateMipmap: vi.fn(),
        getParameter: vi.fn().mockReturnValue(16),
        createImageData: vi.fn(() => ({ 
          data: new Uint8ClampedArray(512 * 512 * 4),
          width: 512,
          height: 512
        })),
        putImageData: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(512 * 512 * 4) })),
        fillRect: vi.fn(),
        fillStyle: '#000000',
        globalAlpha: 1,
        drawImage: vi.fn(),
      }),
      width: 512,
      height: 512,
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    }

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as any
      }
      return document.createElement(tagName)
    })

    textureManager = new TextureManager()
  })

  describe('API Method Availability', () => {
    it('should have all methods that StoreLayout expects', () => {
      expect(typeof textureManager.createCeilingMaterial).toBe('function')
      expect(typeof textureManager.createWoodMaterial).toBe('function') 
      expect(typeof textureManager.createCarpetMaterial).toBe('function')
    })

    it('should not throw is not a function errors', () => {
      expect(() => textureManager.createCeilingMaterial).not.toThrow()
      expect(() => textureManager.createWoodMaterial).not.toThrow()
      expect(() => textureManager.createCarpetMaterial).not.toThrow()
    })
  })
})
