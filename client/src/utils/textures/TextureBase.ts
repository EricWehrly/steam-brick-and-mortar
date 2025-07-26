import * as THREE from 'three'

/**
 * Base interface for all texture generators
 */
export interface TextureOptions {
  width?: number
  height?: number
}

/**
 * Base texture generator interface
 */
export interface TextureGenerator {
  createTexture(options?: TextureOptions): THREE.Texture
}
