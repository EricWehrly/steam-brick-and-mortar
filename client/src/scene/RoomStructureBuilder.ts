/**
 * Room Structure Builder
 * 
 * Handles creation of room structure (floor, walls, ceiling) for the store layout.
 * Extracted from StoreLayout to reduce complexity and improve testability.
 */

import * as THREE from 'three'
import { TextureManager } from '../utils/TextureManager'
import type { StoreLayoutConfig } from './StoreLayoutConfig'
import type { EnvironmentRenderer } from './EnvironmentRenderer'

export class RoomStructureBuilder {
    private textureManager: TextureManager
    private environmentRenderer?: EnvironmentRenderer

    constructor(environmentRenderer?: EnvironmentRenderer) {
        this.textureManager = TextureManager.getInstance()
        this.environmentRenderer = environmentRenderer
    }

    /**
     * Create the basic room structure (floor, walls, ceiling)
     */
    async createRoomStructure(config: StoreLayoutConfig, storeGroup: THREE.Group): Promise<void> {
        await this.createFloor(config, storeGroup)
        await this.createCeiling(config, storeGroup)
        await this.createWalls(config, storeGroup)
    }

    private async createFloor(config: StoreLayoutConfig, storeGroup: THREE.Group): Promise<void> {
        const floorGeometry = new THREE.PlaneGeometry(config.width, config.depth)
        const carpetMaterial = await this.textureManager.createCarpetMaterial({
            color: new THREE.Color('#6B6B6B'), // Neutral gray carpet (was dark red)
            repeat: { x: 4, y: 3 }
        })
        
        const floor = new THREE.Mesh(floorGeometry, carpetMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = 0
        storeGroup.add(floor)
    }

    private async createCeiling(config: StoreLayoutConfig, storeGroup: THREE.Group): Promise<void> {
        const ceilingGeometry = new THREE.PlaneGeometry(config.width, config.depth)
        const ceilingMaterial = await this.textureManager.createCeilingMaterial({
            color: new THREE.Color(0xF5F5DC), // Beige ceiling
            repeat: { x: 2, y: 2 }
        })
        
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        ceiling.rotation.x = Math.PI / 2
        ceiling.position.y = config.height
        ceiling.name = 'room-structure-ceiling'
        console.log(`🏗️ Created room ceiling at height ${config.height} with name '${ceiling.name}'`)
        storeGroup.add(ceiling)
        
        // Register ceiling with EnvironmentRenderer for visibility control
        if (this.environmentRenderer) {
            this.environmentRenderer.registerCeiling(ceiling)
        }
    }

    private async createWalls(config: StoreLayoutConfig, storeGroup: THREE.Group): Promise<void> {
        const wallMaterial = await this.textureManager.createWoodMaterial({
            color: new THREE.Color(0xF5F5DC), // Beige
            repeat: { x: 4, y: 2 }
        })
        
        // Back wall
        const backWallGeometry = new THREE.PlaneGeometry(config.width, config.height)
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial)
        backWall.position.set(0, config.height / 2, -config.depth / 2)
        storeGroup.add(backWall)

        // Side walls
        const sideWallGeometry = new THREE.PlaneGeometry(config.depth, config.height)
        
        const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial)
        leftWall.rotation.y = Math.PI / 2
        leftWall.position.set(-config.width / 2, config.height / 2, 0)
        storeGroup.add(leftWall)

        const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial)
        rightWall.rotation.y = -Math.PI / 2
        rightWall.position.set(config.width / 2, config.height / 2, 0)
        storeGroup.add(rightWall)
    }
}
