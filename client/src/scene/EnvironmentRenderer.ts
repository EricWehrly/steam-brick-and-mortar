/**
 * Environment Renderer - Foundational Environment Setup
 * 
 * Handles the base environment elements that establish the space:
 * - Skybox and atmospheric background
 * - Ceiling visibility management (registry for show/hide controls)
 * - Environmental atmosphere and backdrop
 * 
 * NOTE: Room structure creation (walls, floor, ceiling) now handled by RoomManager.
 * TODO: Consider renaming to SkyboxRenderer or merging ceiling management into RoomManager.
 * 
 * This renderer should be loaded FIRST in the visual sequence to establish
 * the foundational space that lighting and props will inhabit.
 */

import * as THREE from 'three'
import { BlockbusterColors } from '../utils/Colors'
import { TextureManager } from '../utils/TextureManager'
import { SkyboxManager, SkyboxPresets } from './SkyboxManager'
import { AppSettings } from '../core/AppSettings'

export interface EnvironmentConfig {
    roomSize?: {
        width: number
        depth: number
        height: number
    }
    skyboxPreset?: string
    proceduralTextures?: boolean
}

export class EnvironmentRenderer {
    private scene: THREE.Scene
    private textureManager: TextureManager
    private skyboxManager: SkyboxManager
    private environmentGroup: THREE.Group
    private appSettings: AppSettings
    private ceilings: THREE.Mesh[] = []

    constructor(scene: THREE.Scene, appSettings: AppSettings) {
        this.scene = scene
        this.appSettings = appSettings
        this.textureManager = TextureManager.getInstance()
        this.skyboxManager = new SkyboxManager(scene)
        
        // Create group to hold all environment objects
        this.environmentGroup = new THREE.Group()
        this.environmentGroup.name = 'environment'
        this.scene.add(this.environmentGroup)
    }

    public async setupEnvironment(config: EnvironmentConfig = {}): Promise<void> {
        console.log('🌍 Setting up skybox...')
        
        try {
            await this.setupSkybox(config.skyboxPreset ?? 'aurora')
            console.log('✅ Skybox setup complete')
        } catch (error) {
            console.error('❌ Failed to set up skybox:', error)
            await this.setupFallbackSkybox()
        }
    }

    private async setupSkybox(presetName: string): Promise<void> {
        try {
            // Get the preset config or default to aurora
            const preset = (SkyboxPresets as any)[presetName] || SkyboxPresets.aurora
            await this.skyboxManager.applySkybox(preset)
        } catch (error) {
            console.warn('Failed to load skybox, using fallback color:', error)
            // Ultimate fallback to current gold color if something goes wrong
            this.scene.background = new THREE.Color(BlockbusterColors.walls)
        }
    }



    public createEnhancedCeiling(size: number = 20, y: number = 4): THREE.Mesh {
        const ceilingGeometry = new THREE.PlaneGeometry(size, size)
        
        // Use procedural ceiling material with popcorn texture
        const ceilingMaterial = this.textureManager.createProceduralCeilingMaterial({
            repeat: { x: size / 8, y: size / 8 }, // More repeats for ceiling texture detail
            color: '#F5F5DC', // Beige ceiling color
            bumpiness: 0.4,
            roughness: 0.7
        })
        
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        ceiling.rotation.x = Math.PI / 2 // Face down
        ceiling.position.y = y
        ceiling.name = 'environment-ceiling'
        console.log(`🌟 Created enhanced ceiling at height ${y} with name '${ceiling.name}'`)
        this.environmentGroup.add(ceiling)
        
        // Register ceiling for visibility control
        this.registerCeiling(ceiling)
        
        return ceiling
    }

    private async setupFallbackSkybox(): Promise<void> {
        // Simple colored background as fallback
        this.scene.background = new THREE.Color(BlockbusterColors.walls)
        console.warn('⚠️ Using fallback skybox')
    }



    public async changeSkybox(presetName: string): Promise<void> {
        await this.setupSkybox(presetName)
    }

    public registerCeiling(ceiling: THREE.Mesh): void {
        if (!this.ceilings.includes(ceiling)) {
            this.ceilings.push(ceiling)
            console.log(`🏠 Registered ceiling object (${this.ceilings.length} total)`)
        }
    }

    public unregisterCeiling(ceiling: THREE.Mesh): void {
        const index = this.ceilings.indexOf(ceiling)
        if (index > -1) {
            this.ceilings.splice(index, 1)
            console.log(`🏠 Unregistered ceiling object (${this.ceilings.length} remaining)`)
        }
    }

    public setCeilingVisibility(visible: boolean): void {
        // Use direct references instead of magic string lookups
        const validCeilings = this.ceilings.filter(ceiling => 
            ceiling.parent !== null // Still attached to scene
        )
        
        if (validCeilings.length > 0) {
            validCeilings.forEach(ceiling => {
                ceiling.visible = visible
            })
            console.log(`🏠 Ceiling visibility: ${visible ? 'shown' : 'hidden'} (${validCeilings.length} ceiling(s) affected)`)
        } else {
            console.warn('⚠️ No registered ceiling objects found for visibility toggle')
        }

        // Clean up any orphaned references
        if (validCeilings.length < this.ceilings.length) {
            this.ceilings = validCeilings
        }
    }

    public updateCeilingVisibility(): void {
        const showCeiling = this.appSettings.getSetting('showCeiling')
        this.setCeilingVisibility(showCeiling)
    }

    public getEnvironmentStats(): {
        objectCount: number
        hasFloor: boolean
        hasCeiling: boolean
        skyboxActive: boolean
    } {
        return {
            objectCount: this.environmentGroup.children.length,
            hasFloor: this.environmentGroup.children.some(child => child.name.includes('floor')),
            hasCeiling: this.environmentGroup.children.some(child => child.name.includes('ceiling')),
            skyboxActive: this.scene.background !== null
        }
    }

    public clearEnvironment(): void {
        // Remove all children from environment group
        while (this.environmentGroup.children.length > 0) {
            const child = this.environmentGroup.children[0]
            this.environmentGroup.remove(child)
            
            // Dispose geometry and materials
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose()
                if (child.material instanceof THREE.Material) {
                    child.material.dispose()
                } else if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose())
                }
            }
        }
        
        // Clear ceiling registry
        this.ceilings.length = 0
    }

    public dispose(): void {
        this.clearEnvironment()
        this.skyboxManager.dispose()
        this.scene.remove(this.environmentGroup)
    }
}