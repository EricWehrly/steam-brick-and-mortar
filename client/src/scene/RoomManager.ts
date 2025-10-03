/**
 * Roomimport * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import { TextureManager } from '../core/TextureManager'
import { PropRenderer } from './PropRenderer'
import { RoomEventTypes, type RoomCreateEvent, type RoomResizeEvent } from '../types/InteractionEvents'ager - Single Source of Truth for Room Structure
 * 
 * Centralized management of room/store structure creation and resizing.
 * Handles both initial room creation and dynamic resizing based on game count.
 * 
 * Event-driven architecture:
 * - Listens for 'room:create-initial' and 'room:resize' events
 * - Reuses existing walls/floor/ceiling when possible for performance
 * - Maintains single room structure without duplicates
 */

import * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import { TextureManager } from '../utils/TextureManager'
import { RoomEventTypes, type RoomCreateEvent, type RoomResizeEvent } from '../types/InteractionEvents'
import type { StoreLayoutConfig } from './StoreLayoutConfig'
import { PropRenderer } from './PropRenderer'

// ============================================================================
// ROOM CONSTANTS - Single Source of Truth
// ============================================================================

export class RoomConstants {
    // Game layout constants
    static readonly GAMES_PER_SURFACE = 3  // Games per shelf surface (front/back of each shelf level)
    static readonly SURFACES_PER_SHELF = 6 // 3 shelf levels × 2 sides (front/back) = 6 surfaces per shelf unit

    // Shelf spacing constants  
    static readonly SHELF_SPACING_Z = 3     // Distance between shelf rows (Z-axis)
    static readonly SHELF_SPACING_X = 2.5   // Distance between shelf units in a row (X-axis)
    
    // Store clearance constants
    static readonly STORE_ENTRANCE_CLEARANCE = 6  // Front clearance for entrance/navigation (Z-axis)
    static readonly STORE_WALL_CLEARANCE = 2      // Side clearance for walls (X-axis)  
    static readonly STORE_BACK_CLEARANCE = 2      // Back clearance behind shelves (Z-axis)
    static readonly STORE_CEILING_HEIGHT = 3.2    // Store ceiling height

    // Default room dimensions
    static readonly DEFAULT_ROOM_WIDTH = 22
    static readonly DEFAULT_ROOM_DEPTH = 16  
    static readonly DEFAULT_ROOM_HEIGHT = 3.5
}

// Room events are imported from InteractionEvents.ts

// ============================================================================
// ROOM MANAGER
// ============================================================================

export class RoomManager {
    private scene: THREE.Scene
    private textureManager: TextureManager
    private eventManager: EventManager
    
    // Room structure objects (for reuse)
    private roomGroup: THREE.Group | null = null
    private floor: THREE.Mesh | null = null
    private ceiling: THREE.Mesh | null = null
    private walls: {
        front: THREE.Mesh | null
        back: THREE.Mesh | null  
        left: THREE.Mesh | null
        right: THREE.Mesh | null
    } = { front: null, back: null, left: null, right: null }
    
    // Current room dimensions (for reuse calculations)
    private currentDimensions = {
        width: RoomConstants.DEFAULT_ROOM_WIDTH,
        depth: RoomConstants.DEFAULT_ROOM_DEPTH,
        height: RoomConstants.DEFAULT_ROOM_HEIGHT
    }

    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.textureManager = TextureManager.getInstance()
        this.eventManager = EventManager.getInstance()
        
        // Register event listeners
        this.eventManager.registerEventHandler(RoomEventTypes.CreateInitial, this.onCreateInitialRoom.bind(this))
        this.eventManager.registerEventHandler(RoomEventTypes.Resize, this.onResizeRoom.bind(this))
        
        console.debug('🏠 RoomManager initialized with event-driven architecture')
    }

    /**
     * Calculate required room dimensions based on game count
     */
    static calculateDimensionsForGameCount(gameCount: number): { width: number; depth: number; height: number } {
        if (gameCount === 0) {
            return {
                width: RoomConstants.DEFAULT_ROOM_WIDTH,
                depth: RoomConstants.DEFAULT_ROOM_DEPTH,
                height: RoomConstants.DEFAULT_ROOM_HEIGHT
            }
        }

        // Calculate shelves needed
        const gamesPerShelf = RoomConstants.GAMES_PER_SURFACE * RoomConstants.SURFACES_PER_SHELF
        const shelvesNeeded = Math.ceil(gameCount / gamesPerShelf)
        
        // Calculate required dimensions using same logic as StoreLayout
        const maxShelvesPerRow = 4
        const rows = Math.ceil(shelvesNeeded / maxShelvesPerRow)
        const shelvesInLastRow = shelvesNeeded - ((rows - 1) * maxShelvesPerRow)
        const maxShelvesInAnyRow = Math.max(maxShelvesPerRow, shelvesInLastRow)
        
        // Width calculation
        const shelfWidth = 2.0 // Approximate shelf unit width
        const requiredShelfWidth = maxShelvesInAnyRow * shelfWidth + (maxShelvesInAnyRow - 1) * RoomConstants.SHELF_SPACING_X
        const width = requiredShelfWidth + (2 * RoomConstants.STORE_WALL_CLEARANCE)
        
        // Depth calculation  
        const requiredShelfDepth = rows * RoomConstants.SHELF_SPACING_Z
        const depth = requiredShelfDepth + RoomConstants.STORE_ENTRANCE_CLEARANCE + RoomConstants.STORE_BACK_CLEARANCE
        
        return {
            width: Math.max(width, RoomConstants.DEFAULT_ROOM_WIDTH),
            depth: Math.max(depth, RoomConstants.DEFAULT_ROOM_DEPTH), 
            height: RoomConstants.STORE_CEILING_HEIGHT
        }
    }

    /**
     * Event handler: Create initial room
     */
    private async onCreateInitialRoom(event: CustomEvent<RoomCreateEvent>): Promise<void> {
        const config = event.detail
        
        const dimensions = {
            width: config.width ?? RoomConstants.DEFAULT_ROOM_WIDTH,
            depth: config.depth ?? RoomConstants.DEFAULT_ROOM_DEPTH,
            height: config.height ?? RoomConstants.DEFAULT_ROOM_HEIGHT
        }
        
        console.log(`🏠 Creating initial room: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
        
        await this.createRoom(dimensions)
        
        // Emit room created event with current dimensions for other systems to use
        this.eventManager.emit(RoomEventTypes.Created, { 
            dimensions, 
            timestamp: Date.now(), 
            source: 'room-manager' 
        } as any)
    }

    /**
     * Event handler: Resize existing room
     */
    private async onResizeRoom(event: CustomEvent<RoomResizeEvent>): Promise<void> {
        const { width, depth, height, reason } = event.detail
        
        console.log(`🏠 Resizing room to ${width}x${depth}x${height} (reason: ${reason || 'unspecified'})`)
        
        await this.resizeRoom({ width, depth, height })
        
        // Emit room resized event with new dimensions for other systems to update
        this.eventManager.emit(RoomEventTypes.Resized, { 
            dimensions: { width, depth, height }, 
            timestamp: Date.now(), 
            source: 'room-manager' 
        } as any)
    }

    /**
     * Create room structure (called for initial creation)
     */
    private async createRoom(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        // Create room group if it doesn't exist
        if (!this.roomGroup) {
            this.roomGroup = new THREE.Group()
            this.roomGroup.name = 'room-structure'
            this.scene.add(this.roomGroup)
        }
        
        // Create floor
        await this.createFloor(dimensions)
        
        // Create ceiling  
        await this.createCeiling(dimensions)
        
        // Create walls
        await this.createWalls(dimensions)
        
        // Create entrance mat
        await this.createEntranceMat(dimensions)
        
        // Update current dimensions
        this.currentDimensions = { ...dimensions }
        
        console.log(`✅ Room structure created: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
    }

    /**
     * Resize existing room (reuses walls when possible)
     */
    private async resizeRoom(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        if (!this.roomGroup) {
            // No existing room, create new one
            await this.createRoom(dimensions)
            return
        }
        
        console.debug('🔄 Reusing existing room objects and resizing them')
        
        // Resize floor
        await this.resizeFloor(dimensions)
        
        // Resize ceiling
        await this.resizeCeiling(dimensions) 
        
        // Reposition and resize walls
        await this.resizeWalls(dimensions)
        
        // Update current dimensions
        this.currentDimensions = { ...dimensions }
        
        console.log(`✅ Room structure resized: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
    }

    private async createFloor(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        const floorGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        const carpetMaterial = await this.textureManager.createCarpetMaterial({
            color: new THREE.Color('#6B6B6B'),
            repeat: { x: 4, y: 3 }
        })
        
        this.floor = new THREE.Mesh(floorGeometry, carpetMaterial)
        this.floor.rotation.x = -Math.PI / 2
        this.floor.position.y = 0
        this.floor.name = 'room-floor'
        
        this.roomGroup!.add(this.floor)
        console.debug(`🏗️ Created room floor: ${dimensions.width}x${dimensions.depth}`)
    }

    private async resizeFloor(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        if (!this.floor) {
            await this.createFloor(dimensions)
            return
        }
        
        // Replace geometry with new dimensions
        this.floor.geometry.dispose()
        this.floor.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        
        console.debug(`🔄 Resized floor: ${dimensions.width}x${dimensions.depth}`)
    }

    private async createCeiling(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        const ceilingGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        const ceilingMaterial = await this.textureManager.createCeilingMaterial({
            color: new THREE.Color(0xF5F5DC),
            repeat: { x: 2, y: 2 }
        })
        
        this.ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        this.ceiling.rotation.x = Math.PI / 2
        this.ceiling.position.y = dimensions.height
        this.ceiling.name = 'room-ceiling'
        
        this.roomGroup!.add(this.ceiling)
        console.debug(`🏗️ Created room ceiling at height ${dimensions.height}`)
    }

    private async resizeCeiling(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        if (!this.ceiling) {
            await this.createCeiling(dimensions)
            return
        }
        
        // Replace geometry and reposition
        this.ceiling.geometry.dispose()
        this.ceiling.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        this.ceiling.position.y = dimensions.height
        
        console.debug(`🔄 Resized ceiling: ${dimensions.width}x${dimensions.depth} at height ${dimensions.height}`)
    }

    /**
     * Create entrance mat at the front of the store
     */
    private async createEntranceMat(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        const propRenderer = new PropRenderer(this.scene)
        const entranceMat = propRenderer.createEntranceFloorMat(dimensions.width, dimensions.depth)
        this.roomGroup?.add(entranceMat)
        console.debug('🚪 Entrance mat created')
    }

    private async createWalls(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        const wallMaterial = await this.textureManager.createWoodMaterial({
            color: new THREE.Color(0xF5F5DC),
            repeat: { x: 4, y: 2 }
        })
        
        // Back wall
        this.walls.back = new THREE.Mesh(
            new THREE.PlaneGeometry(dimensions.width, dimensions.height),
            wallMaterial
        )
        this.walls.back.position.set(0, dimensions.height / 2, -dimensions.depth / 2)
        this.walls.back.name = 'room-back-wall'
        this.roomGroup!.add(this.walls.back)
        
        // Front wall
        this.walls.front = new THREE.Mesh(
            new THREE.PlaneGeometry(dimensions.width, dimensions.height),
            wallMaterial
        )
        this.walls.front.position.set(0, dimensions.height / 2, dimensions.depth / 2)
        this.walls.front.rotation.y = Math.PI
        this.walls.front.name = 'room-front-wall'
        this.roomGroup!.add(this.walls.front)
        
        // Left wall
        this.walls.left = new THREE.Mesh(
            new THREE.PlaneGeometry(dimensions.depth, dimensions.height),
            wallMaterial
        )
        this.walls.left.position.set(-dimensions.width / 2, dimensions.height / 2, 0)
        this.walls.left.rotation.y = Math.PI / 2
        this.walls.left.name = 'room-left-wall'
        this.roomGroup!.add(this.walls.left)
        
        // Right wall
        this.walls.right = new THREE.Mesh(
            new THREE.PlaneGeometry(dimensions.depth, dimensions.height),
            wallMaterial
        )
        this.walls.right.position.set(dimensions.width / 2, dimensions.height / 2, 0)
        this.walls.right.rotation.y = -Math.PI / 2
        this.walls.right.name = 'room-right-wall'
        this.roomGroup!.add(this.walls.right)
        
        console.debug(`🏗️ Created room walls: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
    }

    private async resizeWalls(dimensions: { width: number; depth: number; height: number }): Promise<void> {
        // If walls don't exist, create them
        if (!this.walls.back) {
            await this.createWalls(dimensions)
            return
        }
        
        // Resize and reposition back wall
        this.walls.back!.geometry.dispose()
        this.walls.back!.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
        this.walls.back!.position.set(0, dimensions.height / 2, -dimensions.depth / 2)
        
        // Resize and reposition front wall
        this.walls.front!.geometry.dispose()
        this.walls.front!.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
        this.walls.front!.position.set(0, dimensions.height / 2, dimensions.depth / 2)
        
        // Resize and reposition left wall
        this.walls.left!.geometry.dispose()
        this.walls.left!.geometry = new THREE.PlaneGeometry(dimensions.depth, dimensions.height)
        this.walls.left!.position.set(-dimensions.width / 2, dimensions.height / 2, 0)
        
        // Resize and reposition right wall
        this.walls.right!.geometry.dispose()
        this.walls.right!.geometry = new THREE.PlaneGeometry(dimensions.depth, dimensions.height)
        this.walls.right!.position.set(dimensions.width / 2, dimensions.height / 2, 0)
        
        console.debug(`🔄 Resized walls: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
    }

    /**
     * Get current room dimensions
     */
    public getCurrentDimensions(): { width: number; depth: number; height: number } {
        return { ...this.currentDimensions }
    }

    /**
     * Dispose room manager and clean up resources
     */
    public dispose(): void {
        if (this.roomGroup) {
            this.scene.remove(this.roomGroup)
            
            // Dispose geometries and materials
            this.roomGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose()
                    if (child.material instanceof THREE.Material) {
                        child.material.dispose()
                    }
                }
            })
            
            this.roomGroup = null
        }
        
        // Reset references
        this.floor = null
        this.ceiling = null
        this.walls = { front: null, back: null, left: null, right: null }
        
        console.debug('🏠 RoomManager disposed')
    }
}