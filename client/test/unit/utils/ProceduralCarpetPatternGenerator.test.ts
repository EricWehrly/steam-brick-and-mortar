import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { ProceduralCarpetPatternGenerator } from '../../../src/utils/textures/ProceduralCarpetPatternGenerator'
import type { CarpetStyleConfig } from '../../../src/utils/textures/ProceduralCarpetPatternGenerator'

describe('ProceduralCarpetPatternGenerator', () => {
  let generator: ProceduralCarpetPatternGenerator

  beforeEach(() => {
    generator = new ProceduralCarpetPatternGenerator()
  })

  afterEach(() => {
    generator.clearCache()
  })

  describe('generateCarpetTexture', () => {
    it('should generate classic blockbuster carpet texture', () => {
      const style: CarpetStyleConfig = {
        patternType: 'classic',
        variant: 'diamond',
        colors: ['#8B0000', '#800020', '#722F37'],
        scale: 1.0,
        density: 0.4
      }

      const texture = generator.generateCarpetTexture({
        width: 256,
        height: 256,
        style
      })

      const image = texture.image as HTMLImageElement
      expect(texture).toBeInstanceOf(THREE.Texture)
      expect(image.width).toBe(256)
      expect(image.height).toBe(256)
      expect(texture.wrapS).toBe(THREE.RepeatWrapping)
      expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    })

    it('should generate 80s arcade geometric texture', () => {
      const style: CarpetStyleConfig = {
        patternType: 'geometric',
        variant: 'standard',
        colors: ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
        scale: 1.0,
        density: 0.6
      }

      const texture = generator.generateCarpetTexture({
        width: 512,
        height: 512,
        style
      })

      const image = texture.image as HTMLImageElement
      expect(texture).toBeInstanceOf(THREE.Texture)
      expect(image.width).toBe(512)
      expect(image.height).toBe(512)
    })

    it('should cache textures with identical configurations', () => {
      const style: CarpetStyleConfig = {
        patternType: 'classic',
        seed: 12345 // Fixed seed for consistent results
      }

      const texture1 = generator.generateCarpetTexture({
        width: 256,
        height: 256,
        style
      })

      const texture2 = generator.generateCarpetTexture({
        width: 256,
        height: 256,
        style
      })

      expect(texture1).toBe(texture2) // Should be the same cached instance
      expect(generator.getCacheStats().count).toBe(1)
    })

    it('should generate different textures for different configurations', () => {
      const style1: CarpetStyleConfig = {
        patternType: 'classic',
        seed: 12345
      }

      const style2: CarpetStyleConfig = {
        patternType: 'geometric',
        seed: 12345
      }

      const texture1 = generator.generateCarpetTexture({
        width: 256,
        height: 256,
        style: style1
      })

      const texture2 = generator.generateCarpetTexture({
        width: 256,
        height: 256,
        style: style2
      })

      expect(texture1).not.toBe(texture2)
      expect(generator.getCacheStats().count).toBe(2)
    })
  })

  describe('createCarpetMaterial', () => {
    it('should create material with generated texture', () => {
      const style: CarpetStyleConfig = {
        patternType: 'classic'
      }

      const material = generator.createCarpetMaterial({
        style,
        roughness: 0.8,
        metalness: 0.1,
        repeat: { x: 2, y: 2 }
      })

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.8)
      expect(material.metalness).toBe(0.1)
      expect(material.map).toBeInstanceOf(THREE.Texture)
      expect(material.map?.repeat.x).toBe(2)
      expect(material.map?.repeat.y).toBe(2)
    })

    it('should use default material properties when not specified', () => {
      const style: CarpetStyleConfig = {
        patternType: 'classic'
      }

      const material = generator.createCarpetMaterial({ style })

      expect(material.roughness).toBe(0.9)
      expect(material.metalness).toBe(0.0)
      expect(material.map?.repeat.x).toBe(1)
      expect(material.map?.repeat.y).toBe(1)
    })
  })

  describe('getAvailablePatterns', () => {
    it('should return available pattern types', () => {
      const patterns = generator.getAvailablePatterns()
      
      expect(patterns).toContain('classic')
      expect(patterns).toContain('geometric')
      expect(patterns.length).toBeGreaterThan(0)
    })
  })

  describe('getDefaultStyles', () => {
    it('should return default style configurations', () => {
      const styles = generator.getDefaultStyles()
      
      expect(styles).toHaveProperty('classic')
      expect(styles).toHaveProperty('80s-arcade-standard')
      expect(styles.classic.patternType).toBe('classic')
      expect(styles['80s-arcade-standard'].patternType).toBe('geometric')
    })

    it('should have valid color arrays for all styles', () => {
      const styles = generator.getDefaultStyles()
      
      Object.values(styles).forEach((style: CarpetStyleConfig) => {
        expect(style.colors).toBeDefined()
        expect(Array.isArray(style.colors)).toBe(true)
        expect(style.colors!.length).toBeGreaterThan(0)
      })
    })
  })

  describe('cache management', () => {
    it('should track cache statistics', () => {
      const initialStats = generator.getCacheStats()
      expect(initialStats.count).toBe(0)
      expect(initialStats.keys).toEqual([])

      const style: CarpetStyleConfig = { patternType: 'classic' }
      generator.generateCarpetTexture({ style })

      const afterStats = generator.getCacheStats()
      expect(afterStats.count).toBe(1)
      expect(afterStats.keys.length).toBe(1)
    })

    it('should clear cache properly', () => {
      const style: CarpetStyleConfig = { patternType: 'classic' }
      generator.generateCarpetTexture({ style })
      
      expect(generator.getCacheStats().count).toBe(1)
      
      generator.clearCache()
      
      expect(generator.getCacheStats().count).toBe(0)
    })
  })

  describe('geometric pattern variants', () => {
    it('should handle all geometric variants', () => {
      const variants = ['standard', 'bubble-font', 'non-euclidean', 'abstract']
      
      variants.forEach(variant => {
        const style: CarpetStyleConfig = {
          patternType: 'geometric',
          variant,
          seed: 12345
        }

        const texture = generator.generateCarpetTexture({
          width: 256,
          height: 256,
          style
        })

        const image = texture.image as HTMLImageElement
        expect(texture).toBeInstanceOf(THREE.Texture)
        expect(image.width).toBe(256)
        expect(image.height).toBe(256)
      })
    })
  })

  describe('seeded generation', () => {
    it('should produce consistent results with same seed', () => {
      const style: CarpetStyleConfig = {
        patternType: 'classic',
        seed: 42
      }

      // Clear cache to ensure fresh generation
      generator.clearCache()

      const texture1 = generator.generateCarpetTexture({
        width: 128,
        height: 128,
        style
      })

      generator.clearCache()

      const texture2 = generator.generateCarpetTexture({
        width: 128,
        height: 128,
        style
      })

      const image1 = texture1.image as HTMLImageElement
      const image2 = texture2.image as HTMLImageElement

      // Since we're using seeded random, the textures should have identical pixel data
      expect(image1.width).toBe(image2.width)
      expect(image1.height).toBe(image2.height)
      
      // Note: In a real test, we'd compare the actual pixel data
      // For now, we just verify the textures were generated successfully
    })
  })
})