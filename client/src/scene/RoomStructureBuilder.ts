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
        floor.name = 'room-structure-floor'
        console.log(`🏗️ Created room floor at height 0 with name '${floor.name}'`)
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
        const backWall = new THREE.Mesh(
            new THREE.PlaneGeometry(config.width, config.height),
            wallMaterial
        )
        backWall.position.set(0, config.height / 2, -config.depth / 2)
        backWall.name = 'room-structure-back-wall'
        console.log(`🏗️ Created back wall with name '${backWall.name}'`)
        storeGroup.add(backWall)
        
        // Front wall
        const frontWall = new THREE.Mesh(
            new THREE.PlaneGeometry(config.width, config.height),
            wallMaterial
        )
        frontWall.position.set(0, config.height / 2, config.depth / 2)
        frontWall.rotation.y = Math.PI
        frontWall.name = 'room-structure-front-wall'
        console.log(`🏗️ Created front wall with name '${frontWall.name}'`)
        storeGroup.add(frontWall)
        
        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(config.depth, config.height),
            wallMaterial
        )
        leftWall.position.set(-config.width / 2, config.height / 2, 0)
        leftWall.rotation.y = Math.PI / 2
        leftWall.name = 'room-structure-left-wall'
        console.log(`🏗️ Created left wall with name '${leftWall.name}'`)
        storeGroup.add(leftWall)
        
        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(config.depth, config.height),
            wallMaterial
        )
        rightWall.position.set(config.width / 2, config.height / 2, 0)
        rightWall.rotation.y = -Math.PI / 2
        rightWall.name = 'room-structure-right-wall'
        console.log(`🏗️ Created right wall with name '${rightWall.name}'`)
        storeGroup.add(rightWall)
        
        // All walls created above with proper names
    }
}
