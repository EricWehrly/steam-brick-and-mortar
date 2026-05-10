/**
 * MDF Veneer Materials Test - Task 6.1.1.1
 * Tests the new MDF veneer material system for realistic shelf appearance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { MaterialType, SharedMaterialManager } from '../../../../src/utils/SharedMaterialManager'

describe('MDF Veneer Materials - Task 6.1.1.1', () => {
  let materialManager: SharedMaterialManager

  beforeEach(() => {
    materialManager = SharedMaterialManager.getInstance()
  })

  afterEach(() => {
    materialManager.dispose()
  })

  describe('MDF Veneer Material', () => {
    it('should create MDF veneer material with realistic properties', () => {
      const material = materialManager.getMaterial(MaterialType.MdfVeneer)

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.8)
      expect(material.metalness).toBe(0.0) // No metallic properties for wood
      expect(material.color.getHexString()).toBe('e6d3b7')
    })

    it('should use realistic MDF veneer color by default', () => {
      const material = materialManager.getMaterial(MaterialType.MdfVeneer)
      
      // Should use light oak veneer color
      expect(material.color.getHexString()).toBe('e6d3b7')
    })
  })

  describe('Shelf Interior Material', () => {
    it('should create glossy white interior material', () => {
      const material = materialManager.getMaterial(MaterialType.ShelfInterior)

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.2) // Very smooth for gloss
      expect(material.metalness).toBe(0.0) // No metallic properties
      expect(material.color.getHexString()).toBe('f8f8f8')
    })

    it('should use white color for interior surfaces', () => {
      const material = materialManager.getMaterial(MaterialType.ShelfInterior)
      
      expect(material.color.getHexString()).toBe('f8f8f8')
    })
  })

  describe('Brand Accent Material', () => {
    it('should create brand blue accent material', () => {
      const material = materialManager.getMaterial(MaterialType.BrandAccent)

      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(material.roughness).toBe(0.3) // Smooth finish
      expect(material.metalness).toBe(0.1) // Slight metallic look
      expect(material.color.getHexString()).toBe('0066cc')
    })

    it('should use consistent brand blue color', () => {
      const material = materialManager.getMaterial(MaterialType.BrandAccent)
      
      // Should use brand blue color
      expect(material.color.getHexString()).toBe('0066cc')
    })
  })

  describe('WoodMaterialGenerator Integration', () => {
    it('should expose shelf materials through SharedMaterialManager', () => {
      const mdfMaterial = materialManager.getMaterial(MaterialType.MdfVeneer)
      const interiorMaterial = materialManager.getMaterial(MaterialType.ShelfInterior)
      const accentMaterial = materialManager.getMaterial(MaterialType.BrandAccent)

      expect(mdfMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(interiorMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(accentMaterial).toBeInstanceOf(THREE.MeshStandardMaterial)
    })
  })

  describe('Material Caching', () => {
    it('should cache MDF veneer materials for performance', () => {
      const material1 = materialManager.getMaterial(MaterialType.MdfVeneer)
      const material2 = materialManager.getMaterial(MaterialType.MdfVeneer)

      // Should return the same cached instance
      expect(material1).toBe(material2)
    })

    it('should create different materials for different options', () => {
      const material1 = materialManager.getMaterial(MaterialType.MdfVeneer)
      const material2 = materialManager.getMaterial(MaterialType.BrandAccent)

      // Should return different instances for different material roles
      expect(material1).not.toBe(material2)
    })
  })
})