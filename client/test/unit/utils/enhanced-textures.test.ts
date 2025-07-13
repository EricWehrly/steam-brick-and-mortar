/**
 * Tests for enhanced procedural texture generation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NoiseGenerator } from '../../../src/utils/NoiseGenerator'
import { ProceduralTextures } from '../../../src/utils/ProceduralTextures'
import { TextureManager } from '../../../src/utils/TextureManager'
import * as THREE from 'three'

describe('NoiseGenerator', () => {
  describe('perlin noise', () => {
    it('should generate consistent values for same input', () => {
      const value1 = NoiseGenerator.perlin(1, 2, 3)
      const value2 = NoiseGenerator.perlin(1, 2, 3)
      expect(value1).toBe(value2)
    })

    it('should generate different values for different inputs', () => {
      const value1 = NoiseGenerator.perlin(1, 2, 3)
      const value2 = NoiseGenerator.perlin(4, 5, 6)
      expect(value1).not.toBe(value2)
    })

    it('should generate values in reasonable range', () => {
      const value = NoiseGenerator.perlin(1, 2, 3)
      expect(value).toBeGreaterThan(-2)
      expect(value).toBeLessThan(2)
    })
  })

  describe('octave noise', () => {
    it('should generate more complex patterns with multiple octaves', () => {
      const simple = NoiseGenerator.perlin(1, 2)
      const complex = NoiseGenerator.octaveNoise(1, 2, 4, 0.5, 1)
      
      // Values should be different due to octave layering
      expect(simple).not.toBe(complex)
    })

    it('should handle different persistence values', () => {
      const lowPersistence = NoiseGenerator.octaveNoise(1, 2, 4, 0.2, 1)
      const highPersistence = NoiseGenerator.octaveNoise(1, 2, 4, 0.8, 1)
      
      expect(lowPersistence).not.toBe(highPersistence)
    })
  })

  describe('specialized noise functions', () => {
    it('should generate wood grain patterns', () => {
      const grain1 = NoiseGenerator.woodGrain(10, 20, 0.1, 0.3)
      const grain2 = NoiseGenerator.woodGrain(30, 40, 0.1, 0.3)
      
      expect(grain1).toBeGreaterThanOrEqual(0)
      expect(grain1).toBeLessThanOrEqual(1)
      expect(grain1).not.toBe(grain2)
    })

    it('should generate carpet fiber patterns', () => {
      const fiber1 = NoiseGenerator.carpetFiber(10, 20, 0.3)
      const fiber2 = NoiseGenerator.carpetFiber(30, 40, 0.3)
      
      expect(typeof fiber1).toBe('number')
      expect(typeof fiber2).toBe('number')
      expect(fiber1).not.toBe(fiber2)
    })

    it('should generate popcorn ceiling patterns', () => {
      const ceiling1 = NoiseGenerator.popcornCeiling(10, 20, 0.4, 0.6)
      const ceiling2 = NoiseGenerator.popcornCeiling(30, 40, 0.4, 0.6)
      
      expect(ceiling1).toBeGreaterThanOrEqual(0)
      expect(ceiling2).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('ProceduralTextures Enhanced', () => {
  let proceduralTextures: ProceduralTextures

  beforeEach(() => {
    proceduralTextures = ProceduralTextures.getInstance()
  })

  afterEach(() => {
    proceduralTextures.clearCache()
  })

  describe('enhanced wood texture', () => {
    it('should create enhanced wood texture with default options', () => {
      const texture = proceduralTextures.createEnhancedWoodTexture()
      
      expect(texture).toBeInstanceOf(THREE.Texture)
      expect(texture.image.width).toBe(512)
      expect(texture.image.height).toBe(512)
      expect(texture.wrapS).toBe(THREE.RepeatWrapping)
      expect(texture.wrapT).toBe(THREE.RepeatWrapping)
    })

    it('should create texture with custom dimensions', () => {
      const texture = proceduralTextures.createEnhancedWoodTexture({
        width: 256,
        height: 256
      })
      
      expect(texture.image.width).toBe(256)
      expect(texture.image.height).toBe(256)
    })

    it('should cache textures with same parameters', () => {
      const options = { width: 256, height: 256, grainStrength: 0.5 }
      const texture1 = proceduralTextures.createEnhancedWoodTexture(options)
      const texture2 = proceduralTextures.createEnhancedWoodTexture(options)
      
      expect(texture1).toBe(texture2)
    })

    it('should create different textures with different parameters', () => {
      const texture1 = proceduralTextures.createEnhancedWoodTexture({ grainStrength: 0.2 })
      const texture2 = proceduralTextures.createEnhancedWoodTexture({ grainStrength: 0.8 })
      
      expect(texture1).not.toBe(texture2)
    })
  })

  describe('enhanced carpet texture', () => {
    it('should create enhanced carpet texture with default options', () => {
      const texture = proceduralTextures.createEnhancedCarpetTexture()
      
      expect(texture).toBeInstanceOf(THREE.Texture)
      expect(texture.image.width).toBe(512)
      expect(texture.image.height).toBe(512)
    })

    it('should handle different fiber densities', () => {
      const sparse = proceduralTextures.createEnhancedCarpetTexture({ fiberDensity: 0.1 })
      const dense = proceduralTextures.createEnhancedCarpetTexture({ fiberDensity: 0.9 })
      
      expect(sparse).not.toBe(dense)
    })

    it('should handle different colors', () => {
      const red = proceduralTextures.createEnhancedCarpetTexture({ color: '#FF0000' })
      const blue = proceduralTextures.createEnhancedCarpetTexture({ color: '#0000FF' })
      
      expect(red).not.toBe(blue)
    })
  })

  describe('enhanced ceiling texture', () => {
    it('should create enhanced ceiling texture with default options', () => {
      const texture = proceduralTextures.createEnhancedCeilingTexture()
      
      expect(texture).toBeInstanceOf(THREE.Texture)
      expect(texture.image.width).toBe(512)
      expect(texture.image.height).toBe(512)
    })

    it('should handle different bump sizes', () => {
      const small = proceduralTextures.createEnhancedCeilingTexture({ bumpSize: 0.1 })
      const large = proceduralTextures.createEnhancedCeilingTexture({ bumpSize: 0.9 })
      
      expect(small).not.toBe(large)
    })

    it('should handle different densities', () => {
      const sparse = proceduralTextures.createEnhancedCeilingTexture({ density: 0.3 })
      const dense = proceduralTextures.createEnhancedCeilingTexture({ density: 0.9 })
      
      expect(sparse).not.toBe(dense)
    })
  })
})

describe('TextureManager Enhanced', () => {
  let textureManager: TextureManager

  beforeEach(() => {
    textureManager = TextureManager.getInstance()
  })

  afterEach(() => {
    textureManager.dispose()
  })

  describe('enhanced procedural materials', () => {
    it('should create enhanced wood material', () => {
      const material = textureManager.createEnhancedProceduralWoodMaterial()
      
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.map).toBeInstanceOf(THREE.Texture)
      expect(material.normalMap).toBeInstanceOf(THREE.Texture)
      expect(material.roughness).toBe(0.8)
      expect(material.metalness).toBe(0.1)
    })

    it('should create enhanced carpet material', () => {
      const material = textureManager.createEnhancedProceduralCarpetMaterial()
      
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.map).toBeInstanceOf(THREE.Texture)
      expect(material.roughness).toBe(0.9)
      expect(material.metalness).toBe(0.0)
    })

    it('should create enhanced ceiling material', () => {
      const material = textureManager.createEnhancedProceduralCeilingMaterial()
      
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.map).toBeInstanceOf(THREE.Texture)
      expect(material.roughness).toBe(0.7)
      expect(material.metalness).toBe(0.0)
    })

    it('should cache materials with same parameters', () => {
      const options = { repeat: { x: 2, y: 2 }, grainStrength: 0.5 }
      const material1 = textureManager.createEnhancedProceduralWoodMaterial(options)
      const material2 = textureManager.createEnhancedProceduralWoodMaterial(options)
      
      expect(material1).toBe(material2)
    })

    it('should handle custom repeat values', () => {
      const material = textureManager.createEnhancedProceduralWoodMaterial({
        repeat: { x: 3, y: 4 }
      })
      
      expect(material.map?.repeat.x).toBe(3)
      expect(material.map?.repeat.y).toBe(4)
      expect(material.normalMap?.repeat.x).toBe(3)
      expect(material.normalMap?.repeat.y).toBe(4)
    })

    it('should handle custom material properties', () => {
      const material = textureManager.createEnhancedProceduralWoodMaterial({
        roughness: 0.5,
        metalness: 0.2
      })
      
      expect(material.roughness).toBe(0.5)
      expect(material.metalness).toBe(0.2)
    })
  })

  describe('memory management', () => {
    it('should report memory usage', () => {
      textureManager.createEnhancedProceduralWoodMaterial()
      textureManager.createEnhancedProceduralCarpetMaterial()
      
      const usage = textureManager.getMemoryUsage()
      expect(usage.materialCount).toBeGreaterThan(0)
    })

    it('should clear all caches on dispose', () => {
      textureManager.createEnhancedProceduralWoodMaterial()
      textureManager.createEnhancedProceduralCarpetMaterial()
      
      textureManager.dispose()
      
      const usage = textureManager.getMemoryUsage()
      expect(usage.materialCount).toBe(0)
    })
  })
})

describe('VR Performance Considerations', () => {
  let textureManager: TextureManager

  beforeEach(() => {
    textureManager = TextureManager.getInstance()
  })

  afterEach(() => {
    textureManager.dispose()
  })

  it('should create textures with VR-optimized settings', () => {
    const material = textureManager.createEnhancedProceduralWoodMaterial()
    
    expect(material.map?.wrapS).toBe(THREE.RepeatWrapping)
    expect(material.map?.wrapT).toBe(THREE.RepeatWrapping)
    expect(material.normalMap?.wrapS).toBe(THREE.RepeatWrapping)
    expect(material.normalMap?.wrapT).toBe(THREE.RepeatWrapping)
  })

  it('should use reasonable texture dimensions for VR', () => {
    const proceduralTextures = ProceduralTextures.getInstance()
    const texture = proceduralTextures.createEnhancedWoodTexture()
    
    // 512x512 is a good balance for VR
    expect(texture.image.width).toBe(512)
    expect(texture.image.height).toBe(512)
  })

  it('should handle large numbers of materials without memory leaks', () => {
    const initialUsage = textureManager.getMemoryUsage()
    
    // Create many materials
    for (let i = 0; i < 10; i++) {
      textureManager.createEnhancedProceduralWoodMaterial({ grainStrength: i * 0.1 })
    }
    
    const newUsage = textureManager.getMemoryUsage()
    expect(newUsage.materialCount).toBe(initialUsage.materialCount + 10)
    
    // Dispose should clean everything
    textureManager.dispose()
    
    const finalUsage = textureManager.getMemoryUsage()
    expect(finalUsage.materialCount).toBe(0)
  })
})
