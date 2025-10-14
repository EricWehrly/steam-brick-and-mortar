/**
 * RoomManager - Single Source of Truth for Room Structure
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
import { SharedMaterialManager, MaterialType } from '../utils/SharedMaterialManager'
import { RoomEventTypes, type RoomCreateEvent, type RoomResizeEvent } from '../types/InteractionEvents'
import { SteamEventTypes, type SteamDataLoadedEvent, CeilingEventTypes, type CeilingToggleEvent } from '../types/InteractionEvents'

import type { StoreLayoutConfig } from './StoreLayoutConfig'
import { PropRenderer } from './PropRenderer'
import { DataManager, DataDomain } from '../core/data'
import type { SteamGameData } from './game-box/types/GameData'

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

export interface RoomDimensions {
    width: number
    depth: number
    height: number
}

export class RoomManager {
    private scene: THREE.Scene
    private materialManager: SharedMaterialManager
    private eventManager: EventManager

    
    // Async mutex to prevent concurrent room operations
    private isProcessingResize: boolean = false
    private pendingResizeQueue: Array<{ dimensions: RoomDimensions, resolve: () => void, reject: (error: Error) => void }> = []
    private dataManager: DataManager
    
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

    constructor(scene: THREE.Scene, dataManager?: DataManager, eventManager?: EventManager) {
        this.scene = scene
        this.dataManager = dataManager || DataManager.getInstance() // Fallback for backward compatibility
        // TODO: Why instance for this and not inject?
        this.materialManager = SharedMaterialManager.getInstance()
        this.eventManager = eventManager || EventManager.getInstance() // DI injection with fallback
        
        this.eventManager.registerEventHandler(RoomEventTypes.Resize, this.onResizeRoom.bind(this))
        
        this.eventManager.registerEventHandler(SteamEventTypes.DataLoaded, this.onResizeRoom.bind(this))
        
        this.eventManager.registerEventHandler(CeilingEventTypes.Toggle, this.onCeilingToggle.bind(this))
        
        console.debug('🏠 RoomManager initialized with event-driven architecture')
    }

    /**
     * Calculate required room dimensions based on game count
     */
    static calculateDimensionsForGameCount(gameCount: number): RoomDimensions {
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

    private onCeilingToggle(event: CustomEvent<CeilingToggleEvent>): void {
        if (this.ceiling) {
            this.ceiling.visible = event.detail.visible
            console.log(`🏠 Ceiling visibility: ${event.detail.visible ? 'shown' : 'hidden'}`)
        } else {
            console.warn('⚠️ No ceiling found for visibility toggle')
        }
    }

    /**
     * Event handler: Resize room (handles both initial creation and updates)
     * Single method that either creates walls (if none exist) or updates existing walls
     */
    private async onResizeRoom(event: CustomEvent<any>): Promise<void> {
        const eventData = event.detail
        const reason = eventData.reason || 'room-resize-requested'
        
        console.log(`🏠 Room resize requested (reason: ${reason})`)
        
        // RoomManager's responsibility: Get games from centralized DataManager
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        const gameCount = games.length
        
        // Calculate appropriate dimensions (uses defaults if gameCount is 0)
        const dimensions = RoomManager.calculateDimensionsForGameCount(gameCount)
        console.debug(`🏠 Target room dimensions for ${gameCount} games: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
        
        // Queue the room update to prevent concurrent operations
        await this.queueRoomOperation(dimensions)
        
        // TODO: Shouldn't above emit the event? 
        // and does it need to be awaited?
        // Emit room resized event with calculated dimensions
        this.eventManager.emit(RoomEventTypes.Resized, { 
            dimensions,
            timestamp: Date.now(), 
            source: 'room-manager' 
        } as any)
    }

    /**
     * Queue room operations to prevent concurrent modifications
     * Implements async mutex pattern to handle rapid-fire events
     */
    private async queueRoomOperation(dimensions: RoomDimensions): Promise<void> {
        if (!this.isProcessingResize) {
            // No operation in progress, process immediately
            this.isProcessingResize = true
            try {
                await this.createOrUpdateRoom(dimensions)
                
                // Process any queued operations with the latest dimensions
                while (this.pendingResizeQueue.length > 0) {
                    const operation = this.pendingResizeQueue.shift()!
                    try {
                        await this.createOrUpdateRoom(operation.dimensions)
                        operation.resolve()
                    } catch (error) {
                        operation.reject(error as Error)
                    }
                }
            } finally {
                this.isProcessingResize = false
            }
        } else {
            // Operation in progress, queue this request
            console.debug('🏠 Room operation in progress, queuing resize request')
            return new Promise<void>((resolve, reject) => {
                this.pendingResizeQueue.push({ dimensions, resolve, reject })
            })
        }
    }

    /**
     * Create or update room (single method that never creates duplicates)
     * Either creates walls if none exist OR updates existing walls - never both
     */
    private async createOrUpdateRoom(dimensions: RoomDimensions): Promise<void> {
        // Ensure room group exists
        if (!this.roomGroup) {
            this.roomGroup = new THREE.Group()
            this.roomGroup.name = 'room-structure'
            this.scene.add(this.roomGroup)
            console.debug('🏠 Created room group')
            
            // TODO: move to props
            await this.createEntranceMat(dimensions)
        }

        // Let resize methods handle their own prerequisites (create if needed, then resize)
        await this.resizeFloor(dimensions)
        await this.resizeCeiling(dimensions)
        await this.resizeWalls(dimensions)

        this.currentDimensions = { ...dimensions }
        
        console.log(`✅ Room structure ready: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
    }

    private async resizeFloor(dimensions: RoomDimensions): Promise<void> {
        if (!this.floor) {
            // Ensure roomGroup exists before creating floor
            if (this.roomGroup) {
                await this.createFloor(dimensions)
            }
            return
        }
        
        // Replace geometry with new dimensions
        this.floor.geometry.dispose()
        this.floor.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        
        console.debug(`🔄 Resized floor: ${dimensions.width}x${dimensions.depth}`)
    }

    private async createFloor(dimensions: RoomDimensions): Promise<void> {
        // Ensure roomGroup exists before creating floor
        if (!this.roomGroup) {
            console.warn('⚠️ roomGroup is null, cannot create floor')
            return
        }
        
        const floorGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        const carpetMaterial = this.materialManager.getMaterial(MaterialType.Carpet)
        
        this.floor = new THREE.Mesh(floorGeometry, carpetMaterial)
        this.floor.rotation.x = -Math.PI / 2
        this.floor.position.y = 0
        this.floor.name = 'room-floor'
        
        this.roomGroup.add(this.floor)
        console.debug(`🏗️ Created room floor: ${dimensions.width}x${dimensions.depth}`)
    }

    private async resizeCeiling(dimensions: RoomDimensions): Promise<void> {
        if (!this.ceiling) {
            // Ensure roomGroup exists before creating ceiling
            if (this.roomGroup) {
                await this.createCeiling(dimensions)
            }
            return
        }
        
        // Replace geometry and reposition
        this.ceiling.geometry.dispose()
        this.ceiling.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        this.ceiling.position.y = dimensions.height
        
        console.debug(`🔄 Resized ceiling: ${dimensions.width}x${dimensions.depth} at height ${dimensions.height}`)
    }

    private async createCeiling(dimensions: RoomDimensions): Promise<void> {
        // Ensure roomGroup exists before creating ceiling
        if (!this.roomGroup) {
            console.warn('⚠️ roomGroup is null, cannot create ceiling')
            return
        }
        
        const ceilingGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        const ceilingMaterial = this.materialManager.getMaterial(MaterialType.Ceiling)
        
        this.ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        this.ceiling.rotation.x = Math.PI / 2
        this.ceiling.position.y = dimensions.height
        this.ceiling.name = 'room-ceiling'
        
        this.roomGroup.add(this.ceiling)
        
        // Ceiling visibility is now managed directly by RoomManager
        console.debug(`🏗️ Created room ceiling at height ${dimensions.height}`)
    }

    /**
     * Create entrance mat at the front of the store
     */
    private async createEntranceMat(dimensions: RoomDimensions): Promise<void> {
        const propRenderer = new PropRenderer(this.scene)
        const entranceMat = propRenderer.createEntranceFloorMat(dimensions.width, dimensions.depth)
        this.roomGroup?.add(entranceMat)
        console.debug('🚪 Entrance mat created')
    }

    private async resizeWalls(dimensions: RoomDimensions): Promise<void> {
        // Check if walls exist before resizing
        if (!this.walls.back || !this.walls.front || !this.walls.left || !this.walls.right) {
            // Ensure roomGroup exists before creating walls
            if (this.roomGroup) {
                await this.createWalls(dimensions)
            }
            return
        }

        // Resize and reposition back wall
        // TODO: docs say we need to dispose, can we hack .scale or use a different object type?
        this.walls.back.geometry.dispose()
        this.walls.back.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
        this.walls.back.position.set(0, dimensions.height / 2, -dimensions.depth / 2)
        
        // Resize and reposition front wall
        this.walls.front.geometry.dispose()
        this.walls.front.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
        this.walls.front.position.set(0, dimensions.height / 2, dimensions.depth / 2)
        
        // Resize and reposition left wall
        this.walls.left.geometry.dispose()
        this.walls.left.geometry = new THREE.PlaneGeometry(dimensions.depth, dimensions.height)
        this.walls.left.position.set(-dimensions.width / 2, dimensions.height / 2, 0)
        
        // Resize and reposition right wall
        this.walls.right.geometry.dispose()
        this.walls.right.geometry = new THREE.PlaneGeometry(dimensions.depth, dimensions.height)
        this.walls.right.position.set(dimensions.width / 2, dimensions.height / 2, 0)
        
        console.debug(`🔄 Resized walls: ${dimensions.width}x${dimensions.depth}x${dimensions.height}`)
    }

    private async createWalls(dimensions: RoomDimensions): Promise<void> {
        const wallMaterial = this.materialManager.getMaterial(MaterialType.WallWood)
        
        // Back wall
        this.walls.back = new THREE.Mesh(
            new THREE.PlaneGeometry(dimensions.width, dimensions.height),
            wallMaterial
        )
        this.walls.back.position.set(0, dimensions.height / 2, -dimensions.depth / 2)
        this.walls.back.name = 'room-back-wall'
        
        // Ensure roomGroup exists before adding walls
        if (!this.roomGroup) {
            console.warn('⚠️ roomGroup is null, cannot add walls')
            return
        }
        
        this.roomGroup.add(this.walls.back)
        
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

    /**
     * Get current room dimensions
     */
    public getCurrentDimensions(): RoomDimensions {
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