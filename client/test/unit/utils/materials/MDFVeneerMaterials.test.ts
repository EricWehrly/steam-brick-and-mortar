/**
 * MDF Veneer Materials Test - Task 6.1.1.1
 * Tests the new MDF veneer material system for realistic shelf appearance
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WoodMaterialGenerator } from '../../../../src/utils/materials/WoodMaterialGenerator'
import { TextureManager } from '../../../../src/utils/TextureManager'

describe('MDF Veneer Materials - Task 6.1.1.1', () => {
  let woodMaterialGenerator: WoodMaterialGenerator
  let textureManager: TextureManager

  beforeEach(() => {
    woodMaterialGenerator = new WoodMaterialGenerator()
    textureManager = TextureManager.getInstance()
  })

  describe('MDF Veneer Material', () => {
    it('should create MDF veneer material with realistic properties', () => {
      const material = woodMaterialGenerator.createMDFVeneerMaterial({
        veneerColor: '#E6D3B7',
        glossiness: 0.4,
        grainSubtlety: 0.2
      })

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.5) // Semi-gloss finish
      expect(material.metalness).toBe(0.0) // No metallic properties for wood
      expect(material.map).toBeDefined() // Should have diffuse texture
      expect(material.normalMap).toBeDefined() // Should have normal map for grain
    })

    it('should use realistic MDF veneer color by default', () => {
      const material = woodMaterialGenerator.createMDFVeneerMaterial()
      
      // Should use light oak veneer color
      expect(material.color.getHexString()).toBe('e6d3b7')
    })
  })

  describe('Shelf Interior Material', () => {
    it('should create glossy white interior material', () => {
      const material = woodMaterialGenerator.createShelfInteriorMaterial({
        glossLevel: 0.8
      })

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.2) // Very smooth for gloss
      expect(material.metalness).toBe(0.0) // No metallic properties
      expect(material.emissiveIntensity).toBeGreaterThan(0) // Should have slight emissive for brightness
    })

    it('should use white color for interior surfaces', () => {
      const material = woodMaterialGenerator.createShelfInteriorMaterial()
      
      // Should use near-white color
      const hex = material.color.getHexString()
      expect(hex).toMatch(/f{5,6}/) // Should be very light/white
    })
  })

  describe('Brand Accent Material', () => {
    it('should create brand blue accent material', () => {
      const material = woodMaterialGenerator.createBrandAccentMaterial({
        brandColor: '#0066CC',
        glossLevel: 0.7
      })

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.3) // Smooth finish
      expect(material.metalness).toBe(0.1) // Slight metallic look
      expect(material.emissiveIntensity).toBeGreaterThan(0) // Should have slight emissive for vibrant color
    })

    it('should use consistent brand blue color', () => {
      const material = woodMaterialGenerator.createBrandAccentMaterial()
      
      // Should use brand blue color
      expect(material.color.getHexString()).toBe('0066cc')
    })
  })

  describe('TextureManager Integration', () => {
    it('should expose MDF veneer materials through TextureManager', () => {
      const mdfMaterial = textureManager.createMDFVeneerMaterial()
      const interiorMaterial = textureManager.createShelfInteriorMaterial()
      const accentMaterial = textureManager.createBrandAccentMaterial()

      expect(mdfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(interiorMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(accentMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
    })
  })

  describe('Material Caching', () => {
    it('should cache MDF veneer materials for performance', () => {
      const material1 = woodMaterialGenerator.createMDFVeneerMaterial({ veneerColor: '#E6D3B7' })
      const material2 = woodMaterialGenerator.createMDFVeneerMaterial({ veneerColor: '#E6D3B7' })

      // Should return the same cached instance
      expect(material1).toBe(material2)
    })

    it('should create different materials for different options', () => {
      const material1 = woodMaterialGenerator.createMDFVeneerMaterial({ veneerColor: '#E6D3B7' })
      const material2 = woodMaterialGenerator.createMDFVeneerMaterial({ veneerColor: '#D2B48C' })

      // Should return different instances for different colors
      expect(material1).not.toBe(material2)
    })
  })
})