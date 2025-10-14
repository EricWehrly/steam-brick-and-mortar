import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SharedMaterialManager, MaterialType } from '../../src/utils/SharedMaterialManager'

describe('SharedMaterialManager API Integration Tests', () => {
  let materialManager: SharedMaterialManager

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

    materialManager = SharedMaterialManager.getInstance()
  })

  describe('API Method Availability', () => {
    it('should have all methods that StoreLayout expects', () => {
      expect(typeof materialManager.getMaterial).toBe('function')
    })

    it('should not throw is not a function errors', () => {
      expect(() => materialManager.getMaterial(MaterialType.Ceiling)).not.toThrow()
      expect(() => materialManager.getMaterial(MaterialType.WallWood)).not.toThrow()
      expect(() => materialManager.getMaterial(MaterialType.Carpet)).not.toThrow()
    })
  })
})
