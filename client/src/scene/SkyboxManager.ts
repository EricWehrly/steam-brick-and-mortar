/**
 * Simple Skybox Manager
 * 
 * Works like CSS: set a background color, then try to load a background image.
 * If the image fails, the color remains as fallback.
 */

import * as THREE from 'three'

export interface SkyboxConfig {
    /** Path to the skybox image (relative to public folder) */
    imagePath: string
    /** Fallback color if image fails to load */
    fallbackColor?: string | number
}

export class SkyboxManager {
    private scene: THREE.Scene
    private textureLoader: THREE.TextureLoader

    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.textureLoader = new THREE.TextureLoader()
    }

    /**
     * Apply skybox - CSS-style: set color first, then try image
     */
    async applySkybox(config: SkyboxConfig): Promise<boolean> {
        // Set fallback color first (like CSS background-color)
        const fallbackColor = config.fallbackColor || 0x404040
        this.scene.background = new THREE.Color(fallbackColor)

        // Try to load and apply image (like CSS background-image)
        try {
            const texture = await this.loadTexture(config.imagePath)
            this.scene.background = texture
            return true
        } catch (error) {
            console.warn('Skybox image failed to load, using fallback color:', error)
            // Color is already set, so we're good
            return false
        }
    }

    /**
     * Load texture for skybox use
     */
    private async loadTexture(imagePath: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                imagePath,
                (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping
                    texture.colorSpace = THREE.SRGBColorSpace
                    resolve(texture)
                },
                undefined,
                reject
            )
        })
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.scene.background instanceof THREE.Texture) {
            this.scene.background.dispose()
        }
    }
}

/**
 * Simple preset configurations
 */
export const SkyboxPresets = {
    aurora: {
        imagePath: '/textures/skyboxes/aurorasky.png',
        fallbackColor: 0x404040  // Dark gray
    }
} as const
