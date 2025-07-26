import * as THREE from 'three'

/**
 * Base interface for material options
 */
export interface MaterialOptions {
  repeat?: { x: number; y: number }
  roughness?: number
  metalness?: number
}

/**
 * Base interface for material generators
 */
export interface MaterialGenerator {
  createMaterial(options?: MaterialOptions): THREE.Material | Promise<THREE.Material>
}

/**
 * Base interface for texture loading options
 */
export interface TextureLoadOptions {
  repeat?: { x: number; y: number }
  anisotropy?: number
}
