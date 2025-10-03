/**
 * Environment Renderer - Foundational Environment Setup
 * 
 * Handles the base environment elements that establish the space:
 * - Skybox and atmospheric background
 * - Room structure (walls, floor, ceiling) 
 * - Store geometry and spatial foundation
 * - Environmental atmosphere and backdrop
 * 
 * This renderer should be loaded FIRST in the visual sequence to establish
 * the foundational space that lighting and props will inhabit.
 */

import * as THREE from 'three'
import { BlockbusterColors } from '../utils/Colors'
import { TextureManager } from '../utils/TextureManager'
import { SkyboxManager, SkyboxPresets } from './SkyboxManager'
import { RoomStructureBuilder } from './RoomStructureBuilder'
import { AppSettings } from '../core/AppSettings'
import type { StoreLayoutConfig } from './StoreLayoutConfig'

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
    private roomBuilder: RoomStructureBuilder
    private environmentGroup: THREE.Group
    private appSettings: AppSettings
    private ceilings: THREE.Mesh[] = []

    constructor(scene: THREE.Scene, appSettings: AppSettings) {
        this.scene = scene
        this.appSettings = appSettings
        this.textureManager = TextureManager.getInstance()
        this.skyboxManager = new SkyboxManager(scene)
        this.roomBuilder = new RoomStructureBuilder(this)
        
        // Create group to hold all environment objects
        this.environmentGroup = new THREE.Group()
        this.environmentGroup.name = 'environment'
        this.scene.add(this.environmentGroup)
    }

    public async setupEnvironment(config: EnvironmentConfig = {}): Promise<void> {
        console.log('🌍 Setting up environment foundation...')
        
        try {
            await this.setupSkybox(config.skyboxPreset ?? 'aurora')
            await this.setupRoomStructure(config)
            
            console.log('✅ Environment foundation complete!')
        } catch (error) {
            console.error('❌ Failed to set up environment:', error)
            // Fallback to basic environment
            await this.setupFallbackEnvironment()
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

    private async setupRoomStructure(config: EnvironmentConfig): Promise<void> {
        const roomSize = config.roomSize ?? { width: 22, depth: 16, height: 4 }
        
        // Create store layout configuration for room building
        const storeConfig: StoreLayoutConfig = {
            width: roomSize.width,
            height: roomSize.height,
            depth: roomSize.depth,
            entranceZone: {
                width: 6,
                depth: 3,
                position: new THREE.Vector3(0, 0, 6.5)
            },
            shelfRows: 2,
            shelfUnitsPerRow: 3,
            shelfSpacing: 3.0,
            aisleWidth: 2.2,
            mainAisleWidth: 3.0,
            wallClearance: 1.0,
            sections: [] // We only need room structure, not sections
        }
        
        // Use existing room builder to create walls, floor, ceiling
        await this.roomBuilder.createRoomStructure(storeConfig, this.environmentGroup)
        
        // Apply current ceiling visibility setting
        this.updateCeilingVisibility()
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

    private async setupFallbackEnvironment(): Promise<void> {
        // Simple colored background
        this.scene.background = new THREE.Color(BlockbusterColors.walls)
        
        // Basic floor
        const floor = this.createBasicFloor()
        this.environmentGroup.add(floor)
        
        console.warn('⚠️ Using fallback environment')
    }

    private createBasicFloor(): THREE.Mesh {
        const floorGeometry = new THREE.PlaneGeometry(20, 20)
        // FIXED: Use MeshStandardMaterial instead of MeshLambertMaterial for RectAreaLight compatibility
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(BlockbusterColors.floor),
            roughness: 0.8,
            metalness: 0.1
        })
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = -2
        floor.receiveShadow = true
        floor.name = 'basic-floor'
        return floor
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