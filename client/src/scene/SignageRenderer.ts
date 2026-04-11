/**
 * Signage Renderer - Wall Signage for Blockbuster Store
 * 
 * Handles:
 * - Create category signs (NEW RELEASES, EMPLOYEE PICKS, FAMILY)
 * - Position signs above shelf sections
 * - Use canvas textures for text rendering
 */

import * as THREE from 'three'
import { BlockbusterColors } from '../utils/Colors'

export interface SignageConfig {
    text: string
    position: THREE.Vector3
    backgroundColor: number
    textColor: number
    width?: number
    height?: number
}

export class SignageRenderer {
    private static readonly DEFAULT_SIGN_WIDTH = 2.0
    private static readonly DEFAULT_SIGN_HEIGHT = 0.4
    private static readonly DEFAULT_FONT_SIZE = 64
    private static readonly DEFAULT_FONT_FAMILY = 'Arial, sans-serif'
    private static readonly LETTER_SPACING = '0.05em'

    private canvas: HTMLCanvasElement
    private context: CanvasRenderingContext2D
    private signs: THREE.Mesh[] = []

    constructor() {
        // Create canvas for text rendering
        this.canvas = document.createElement('canvas')
        this.canvas.width = 512
        this.canvas.height = 96   // tighter — reduces visual vertical padding
        
        const context = this.canvas.getContext('2d')
        if (!context) {
            throw new Error('Failed to get 2D canvas context for signage')
        }
        this.context = context
    }

    /**
     * Create standard Blockbuster category signs
     */
    public createStandardSigns(scene: THREE.Scene): THREE.Mesh[] {
        console.log('🏷️ Creating Blockbuster category signs...')
        
        const signConfigs: SignageConfig[] = [
            {
                text: 'NEW RELEASES',
                position: new THREE.Vector3(-4, 2, -2.8),
                backgroundColor: BlockbusterColors.newReleasesRed,
                textColor: BlockbusterColors.newReleasesText,
            },
            {
                text: 'EMPLOYEE PICKS',
                position: new THREE.Vector3(0, 2, -2.8),
                backgroundColor: BlockbusterColors.categoryBlue,
                textColor: BlockbusterColors.categoryText,
            },
            {
                text: 'FAMILY',
                position: new THREE.Vector3(4, 2, -2.8),
                backgroundColor: BlockbusterColors.categoryBlue,
                textColor: BlockbusterColors.categoryText,
            }
        ]

        const createdSigns: THREE.Mesh[] = []
        
        signConfigs.forEach(config => {
            const sign = this.createSign(config)
            scene.add(sign)
            this.signs.push(sign)
            createdSigns.push(sign)
        })

        console.log(`✅ Created ${createdSigns.length} category signs`)
        return createdSigns
    }

    /**
     * 🚀 FUTURE: Create 3D blocky "NEW RELEASES" signage at 15-degree angle
     * 
     * Roadmap implementation for Phase 2 Feature 5.6.1
     * This will create dimensional letter forms instead of flat canvas-based signs
     * 
     * Planned approach:
     * - Use THREE.TextGeometry or ExtrudeGeometry for 3D letter creation
     * - Apply 15-degree rotation for dynamic wall mounting
     * - Position prominently on back wall above New Releases section
     * - Use BlockbusterColors.newReleasesRed for material styling
     * 
     * Example usage (future):
     * const newReleasesSign = signageRenderer.create3DBlockySign({
     *   text: 'NEW RELEASES',
     *   position: new THREE.Vector3(-6, 2.5, -7.8),
     *   rotation: new THREE.Euler(0, 0, -Math.PI / 12), // 15 degrees
     *   depth: 0.3,
     *   color: BlockbusterColors.newReleasesRed
     * })
     * 
     * See: docs/roadmap-phase2-ready-for-friends.md Feature 5.6
     */

    /**
     * Create a single sign with text
     */
    public createSign(config: SignageConfig): THREE.Mesh {
        const width = config.width ?? SignageRenderer.DEFAULT_SIGN_WIDTH
        const height = config.height ?? SignageRenderer.DEFAULT_SIGN_HEIGHT
        
        // Create text texture
        const texture = this.createTextTexture(config.text, config.backgroundColor, config.textColor)
        
        // Create sign geometry and material
        const signGeometry = new THREE.PlaneGeometry(width, height)
        const signMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            roughness: 0.3,
            metalness: 0.0,
        })
        
        const sign = new THREE.Mesh(signGeometry, signMaterial)
        sign.position.copy(config.position)
        
        // Mark as signage for identification
        sign.userData = {
            isSignage: true,
            signText: config.text,
            category: config.text.toLowerCase().replace(/\s+/g, '-')
        }
        
        return sign
    }

    /**
     * Bake a texture snapshot for the given text + colors.
     * Returns a DataTexture; caller is responsible for disposing the old one.
     *
     * Returns DataTexture specifically (not the base Texture) because we snapshot
     * raw pixel data via getImageData — the returned object is always a DataTexture
     * at runtime. Correcting the return type makes that explicit and lets callers
     * dispose/set mat.map without unsafe casts.
     */
    public bakeTexture(text: string, backgroundColor: number, textColor: number): THREE.DataTexture {
        return this.createTextTexture(text, backgroundColor, textColor)
    }

    /**
     * Create text texture using canvas
     */
    private createTextTexture(text: string, backgroundColor: number, textColor: number): THREE.DataTexture {
        // Reuse a single working canvas, but freeze each sign texture into a separate
        // DataTexture snapshot so signs don't all update to the last rendered label.
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)

        this.context.fillStyle = `#${backgroundColor.toString(16).padStart(6, '0')}`
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height)

        this.context.fillStyle = `#${textColor.toString(16).padStart(6, '0')}`
        this.context.font = `bold ${SignageRenderer.DEFAULT_FONT_SIZE}px ${SignageRenderer.DEFAULT_FONT_FAMILY}`
        this.context.textAlign = 'center'
        this.context.textBaseline = 'middle'
        ;(this.context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = SignageRenderer.LETTER_SPACING
        this.context.shadowColor = 'rgba(0, 0, 0, 0.5)'
        this.context.shadowBlur = 4
        this.context.shadowOffsetX = 2
        this.context.shadowOffsetY = 2
        this.context.fillText(text, this.canvas.width / 2, this.canvas.height / 2)

        const snapshot = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
        const pixels = new Uint8Array(snapshot.data)
        const texture = new THREE.DataTexture(pixels, this.canvas.width, this.canvas.height, THREE.RGBAFormat)
        texture.flipY = true  // DataTexture defaults to false; canvas pixel data is top-down like CanvasTexture
        texture.needsUpdate = true
        return texture
    }

    /**
     * Update sign text (creates new texture)
     */
    public updateSignText(sign: THREE.Mesh, newText: string): void {
        if (!sign.userData?.isSignage) {
            console.warn('⚠️ Attempted to update text on non-signage object')
            return
        }
        
        const material = sign.material as THREE.MeshStandardMaterial
        if (material.map) {
            material.map.dispose()
        }
        
        // Get original colors from userData or use defaults
        const backgroundColor = BlockbusterColors.categoryBlue
        const textColor = BlockbusterColors.categoryText
        
        material.map = this.createTextTexture(newText, backgroundColor, textColor)
        sign.userData.signText = newText
    }

    /**
     * Remove all signs from scene
     */
    public clearSigns(scene: THREE.Scene): void {
        this.signs.forEach(sign => {
            scene.remove(sign)
            
            // Dispose of textures and materials
            const material = sign.material as THREE.MeshStandardMaterial
            if (material.map) {
                material.map.dispose()
            }
            material.dispose()
            sign.geometry.dispose()
        })
        
        this.signs = []
        console.log('🗑️ Cleared all signage')
    }

    /**
     * Get all signs in the scene
     */
    public getSigns(): THREE.Mesh[] {
        return [...this.signs]
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        // Clear all signs from any scene they might be in
        this.signs.forEach(sign => {
            const material = sign.material as THREE.MeshStandardMaterial
            if (material.map) {
                material.map.dispose()
            }
            material.dispose()
            sign.geometry.dispose()
        })
        
        this.signs = []
        // Canvas will be garbage collected
    }
}
