import * as THREE from 'three'
import { AppSettings, Setting, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { SharedMaterialManager, MaterialType } from '../utils/SharedMaterialManager'
import {
    RoomEventTypes,
    type RoomResizedEvent,
    CeilingEventTypes,
    GameEventTypes,
    type ShelfLayoutDeterminedEvent,
    AppSettingsEventTypes,
    UIEventTypes,
} from '../types/InteractionEvents'
import type { LayoutRequestedEvent } from '../types/EnvironmentEvents'
import { type CeilingToggleEvent } from '../types/LightingEvents'
import { StorePropsEventTypes, type StorePropsProgressEvent } from '../types/InteractionEvents'
import { DataManager } from '../core/data/DataManager'
import { DataKey, DataDomain } from '../core/data/DataTypes'
import { PerformanceMonitor } from '../utils/PerformanceMonitor'
import { Logger } from '../utils/Logger'
import { LayoutModes } from '../types/LayoutTypes'
import { RenderLoopRegistry } from './RenderLoopRegistry'

// TD: room-defaults-ownership
export class RoomConstants {
    static readonly GAMES_PER_SURFACE = 3
    static readonly SURFACES_PER_SHELF = 6
    static readonly SHELF_SPACING_Z = 3
    static readonly SHELF_SPACING_X = 2.5
    static readonly STORE_ENTRANCE_CLEARANCE = 6
    static readonly STORE_WALL_CLEARANCE = 2
    static readonly STORE_BACK_CLEARANCE = 2
    static readonly STORE_FRONT_OFFSET = 1.0
    static readonly DEFAULT_ROOM_WIDTH = 22
    static readonly DEFAULT_ROOM_DEPTH = 16  
    static readonly DEFAULT_ROOM_HEIGHT = 3.5
}

export interface RoomDimensions {
    width: number
    depth: number
    height: number
}

interface ShelfBounds {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
}

export function computeRoomEnvelopeFromShelfBounds(
    shelfBounds: ShelfBounds,
    ceilingHeight: number = RoomConstants.DEFAULT_ROOM_HEIGHT
): {
    dimensions: RoomDimensions
    centerOffset: { x: number; y: number; z: number }
} {
    const roomWidth = (shelfBounds.maxX - shelfBounds.minX) + (RoomConstants.STORE_WALL_CLEARANCE * 2)
    const roomHeight = ceilingHeight

    // Spoke-like layouts straddle origin and should be centered within the room.
    // Forward-facing layouts keep extra entrance clearance in front.
    const spansOrigin = shelfBounds.minZ < 0 && shelfBounds.maxZ > 0
    const backClearance = RoomConstants.STORE_BACK_CLEARANCE
    const frontClearance = spansOrigin
        ? RoomConstants.STORE_BACK_CLEARANCE
        : RoomConstants.STORE_ENTRANCE_CLEARANCE

    const roomMinZ = shelfBounds.minZ - backClearance
    const roomMaxZ = shelfBounds.maxZ + frontClearance
    const roomDepth = roomMaxZ - roomMinZ
    const roomCenterZ = (roomMinZ + roomMaxZ) / 2

    // RoomManager applies STORE_FRONT_OFFSET at build time; keep event payload
    // in pre-offset coordinates for downstream systems that follow the same contract.
    const centerOffset = { x: 0, y: 0, z: roomCenterZ - RoomConstants.STORE_FRONT_OFFSET }

    return {
        dimensions: { width: roomWidth, depth: roomDepth, height: roomHeight },
        centerOffset,
    }
}

export class RoomManager {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private materialManager: SharedMaterialManager
    private eventManager: EventManager
    private appSettings: AppSettings
    private logger = Logger.createLogFunctions('RoomManager')
    
    // Resize state: if room is building, this is the target; otherwise resize immediately
    private targetDimensions: RoomDimensions | null = null
    private targetCenterOffset: { x: number; y: number; z: number } | null = null
    private isBuilding = false
    private hasPositionedCamera = false
    private currentCenterOffset?: { x: number; y: number; z: number }
    private currentShelfLayout?: { rows: number; shelvesPerRow?: number }

    // Liminal treadmill: the room shell is a fixed-size envelope that must translate
    // with the player indefinitely (Fork A — the player walks through absolute world
    // space while shelves recycle to ever-further ranks). Baseline captured whenever
    // the shell is (re)built; followed every frame while liminal is active. Without
    // this, recycled shelves end up beyond the shell's static walls and get occluded.
    private isLiminalActive = false
    private appliedZAtLastBuild = 0
    private cameraZAtLastBuild = 0

    // Room structure (reused on resize)
    private roomGroup: THREE.Group | null = null
    private floor: THREE.Mesh | null = null
    private ceiling: THREE.Mesh | null = null
    private walls: {
        front: THREE.Mesh | null
        back: THREE.Mesh | null  
        left: THREE.Mesh | null
        right: THREE.Mesh | null
    } = { front: null, back: null, left: null, right: null }
    
    private currentDimensions: RoomDimensions = {
        width: RoomConstants.DEFAULT_ROOM_WIDTH,
        depth: RoomConstants.DEFAULT_ROOM_DEPTH,
        height: RoomConstants.DEFAULT_ROOM_HEIGHT
    }

    constructor() {
        const dataManager = DataManager.getInstance()
        this.scene = dataManager.getOrThrow<THREE.Scene>(DataKey.MainScene)
        this.camera = dataManager.getOrThrow<THREE.PerspectiveCamera>(DataKey.MainCamera)
        
        this.materialManager = SharedMaterialManager.getInstance()
        this.eventManager = EventManager.getInstance()
        this.appSettings = AppSettings.getInstance()
        this.currentDimensions.height = this.getCurrentCeilingHeight()
        
        this.eventManager.registerEventHandler(GameEventTypes.ShelfLayoutDetermined, this.onShelfLayoutDetermined.bind(this))
        this.eventManager.registerEventHandler(CeilingEventTypes.Toggle, this.onCeilingToggle.bind(this))
        this.eventManager.registerEventHandler(AppSettingsEventTypes.Changed, this.onAppSettingsChanged.bind(this))
        this.eventManager.registerEventHandler<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, this.onLayoutRequested.bind(this))
        RenderLoopRegistry.getInstance().register('RoomManager', this.onFrame.bind(this))

        // Fire-and-forget initial room creation
        this.createInitialRoom()
    }

    private onLayoutRequested(event: CustomEvent<LayoutRequestedEvent>): void {
        this.isLiminalActive = event.detail.layoutMode === LayoutModes.Liminal
    }

    private onFrame(): void {
        if (!this.isLiminalActive || !this.roomGroup) return
        this.roomGroup.position.z = this.appliedZAtLastBuild + (this.camera.position.z - this.cameraZAtLastBuild)
    }
    
    private async createInitialRoom(): Promise<void> {
        this.isBuilding = true
        try {
            await this.buildRoom(this.currentDimensions)
            
            // If resize was requested during build, apply it now
            if (this.targetDimensions) {
                await this.buildRoom(this.targetDimensions, this.targetCenterOffset ?? undefined)
                this.targetDimensions = null
                this.targetCenterOffset = null
            }
        } finally {
            this.isBuilding = false
        }
    }

    private onCeilingToggle(event: CustomEvent<CeilingToggleEvent>): void {
        if (this.ceiling) {
            this.ceiling.visible = event.detail.visible
        }
    }

    private async onShelfLayoutDetermined(event: CustomEvent<ShelfLayoutDeterminedEvent>): Promise<void> {
        const perf = PerformanceMonitor.start('room-resize-calculation', this.logger)
        
        const { shelfBounds, shelfLayout } = event.detail
        this.currentShelfLayout = shelfLayout
        
        // Validate shelf bounds exist
        if (shelfBounds.minX === Infinity) {
            perf.end()
            console.debug('🏠 ShelfLayoutDetermined received with no shelf bounds - skipping resize')
            return
        }
        
        const { dimensions, centerOffset } = computeRoomEnvelopeFromShelfBounds(shelfBounds, this.getCurrentCeilingHeight())
        this.currentCenterOffset = centerOffset
        
        console.debug(`📐 Shelf bounds: X[${shelfBounds.minX.toFixed(1)}, ${shelfBounds.maxX.toFixed(1)}], Z[${shelfBounds.minZ.toFixed(1)}, ${shelfBounds.maxZ.toFixed(1)}]`)
        console.debug(`🏠 Calculated room: ${dimensions.width.toFixed(1)}x${dimensions.depth.toFixed(1)}x${dimensions.height.toFixed(1)}, center Z: ${(centerOffset.z + RoomConstants.STORE_FRONT_OFFSET).toFixed(1)}`)
        
        perf.end({ rows: shelfLayout.rows, shelvesPerRow: shelfLayout.shelvesPerRow })
        
        if (this.isBuilding) {
            this.targetDimensions = dimensions
            this.targetCenterOffset = centerOffset
            console.debug('🏠 Room building, queued resize target')
        } else {
            await this.buildRoom(dimensions, centerOffset)
        }
        
        // Notify listeners that room has resized
        this.eventManager.emit<RoomResizedEvent>(RoomEventTypes.Resized, { 
            dimensions,
            shelfLayout,
            centerOffset
        })
    }


    private async onAppSettingsChanged(event: CustomEvent<SettingChangedEvent>): Promise<void> {
        if (event.detail.settingName !== Setting.CeilingHeight) {
            return
        }

        const ceilingHeight = this.getCurrentCeilingHeight()
        if (ceilingHeight === this.currentDimensions.height) {
            return
        }

        const dimensions: RoomDimensions = {
            ...this.currentDimensions,
            height: ceilingHeight
        }

        if (this.isBuilding) {
            this.targetDimensions = dimensions
            this.targetCenterOffset = this.currentCenterOffset ?? null
            console.debug('🏠 Room building, queued ceiling-height update')
        } else {
            await this.buildRoom(dimensions, this.currentCenterOffset)
        }

        this.eventManager.emit<RoomResizedEvent>(RoomEventTypes.Resized, {
            dimensions,
            shelfLayout: this.currentShelfLayout,
            centerOffset: this.currentCenterOffset
        })
    }

    private getCurrentCeilingHeight(): number {
        return this.appSettings.getSetting('ceilingHeight')
    }

    private async buildRoom(dimensions: RoomDimensions, centerOffset?: { x: number; y: number; z: number }): Promise<void> {
        if (!this.roomGroup) {
            this.roomGroup = new THREE.Group()
            this.roomGroup.name = 'room-structure'
            this.scene.add(this.roomGroup)
            DataManager.getInstance().set(DataKey.RoomFrame, this.roomGroup, { domain: DataDomain.RoomManager })
        }
        
        if (centerOffset) {
            const appliedZ = centerOffset.z + RoomConstants.STORE_FRONT_OFFSET
            this.roomGroup.position.set(centerOffset.x, centerOffset.y, appliedZ)
            this.currentCenterOffset = centerOffset

            if (!this.hasPositionedCamera) {
                this.hasPositionedCamera = true
                const targetZ = appliedZ - (dimensions.depth / 2)
                this.camera.position.set(0, 1.6, 0)
                this.camera.lookAt(0, 1.6, targetZ)
                console.debug(`📷 Camera initial position set to face store center at Z=${targetZ.toFixed(1)}`)
            }

            // Captured after any camera repositioning above, so the liminal
            // follow logic (onFrame) always has an accurate baseline pair.
            this.appliedZAtLastBuild = appliedZ
            this.cameraZAtLastBuild = this.camera.position.z
        }

        this.emitProgress('Building floor')
        this.ensureFloor(dimensions)
        
        this.emitProgress('Building ceiling')
        this.ensureCeiling(dimensions)
        
        this.emitProgress('Building walls')
        this.ensureWalls(dimensions)

        this.currentDimensions = { ...dimensions }
        console.debug(`🏠 Room ready: ${dimensions.width.toFixed(0)}x${dimensions.depth.toFixed(0)}x${dimensions.height.toFixed(0)}`)
    }
    
    private emitProgress(detail: string): void {
        this.eventManager.emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'room',
            detail
        })
    }

    private ensureFloor(dimensions: RoomDimensions): void {
        if (!this.roomGroup) return
        
        if (this.floor) {
            this.floor.geometry.dispose()
            this.floor.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
        } else {
            this.floor = new THREE.Mesh(
                new THREE.PlaneGeometry(dimensions.width, dimensions.depth),
                this.materialManager.getMaterial(MaterialType.Carpet)
            )
            this.floor.rotation.x = -Math.PI / 2
            this.floor.position.y = 0
            this.floor.name = 'room-floor'
            this.roomGroup.add(this.floor)
        }

        this.floor.castShadow = false
        this.floor.receiveShadow = true
    }

    private ensureCeiling(dimensions: RoomDimensions): void {
        if (!this.roomGroup) return
        
        if (this.ceiling) {
            this.ceiling.geometry.dispose()
            this.ceiling.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
            this.ceiling.position.y = dimensions.height
        } else {
            this.ceiling = new THREE.Mesh(
                new THREE.PlaneGeometry(dimensions.width, dimensions.depth),
                this.materialManager.getMaterial(MaterialType.Ceiling)
            )
            this.ceiling.rotation.x = Math.PI / 2
            this.ceiling.position.y = dimensions.height
            this.ceiling.name = 'room-ceiling'
            this.roomGroup.add(this.ceiling)
        }

        this.ceiling.castShadow = false
        this.ceiling.receiveShadow = true
    }

    private ensureWalls(dimensions: RoomDimensions): void {
        if (!this.roomGroup) return
        
        const wallMaterial = this.materialManager.getMaterial(MaterialType.WallWood)
        const glassMaterial = this.materialManager.getMaterial(MaterialType.Glass)
        const halfHeight = dimensions.height / 2
        
        // Back wall
        if (this.walls.back) {
            this.walls.back.geometry.dispose()
            this.walls.back.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
            this.walls.back.position.set(0, halfHeight, -dimensions.depth / 2)
        } else {
            this.walls.back = new THREE.Mesh(
                new THREE.PlaneGeometry(dimensions.width, dimensions.height),
                wallMaterial
            )
            this.walls.back.position.set(0, halfHeight, -dimensions.depth / 2)
            this.walls.back.name = 'room-back-wall'
            this.roomGroup.add(this.walls.back)
        }
        this.walls.back.castShadow = false
        this.walls.back.receiveShadow = true
        
        // Front wall (glass storefront)
        if (this.walls.front) {
            this.walls.front.geometry.dispose()
            this.walls.front.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
            this.walls.front.position.set(0, halfHeight, dimensions.depth / 2)
        } else {
            this.walls.front = new THREE.Mesh(
                new THREE.PlaneGeometry(dimensions.width, dimensions.height),
                glassMaterial
            )
            this.walls.front.position.set(0, halfHeight, dimensions.depth / 2)
            this.walls.front.rotation.y = Math.PI
            this.walls.front.name = 'room-front-wall-glass'
            this.roomGroup.add(this.walls.front)
        }
        this.walls.front.castShadow = false
        this.walls.front.receiveShadow = true
        
        // Left wall
        if (this.walls.left) {
            this.walls.left.geometry.dispose()
            this.walls.left.geometry = new THREE.PlaneGeometry(dimensions.depth, dimensions.height)
            this.walls.left.position.set(-dimensions.width / 2, halfHeight, 0)
        } else {
            this.walls.left = new THREE.Mesh(
                new THREE.PlaneGeometry(dimensions.depth, dimensions.height),
                wallMaterial
            )
            this.walls.left.position.set(-dimensions.width / 2, halfHeight, 0)
            this.walls.left.rotation.y = Math.PI / 2
            this.walls.left.name = 'room-left-wall'
            this.roomGroup.add(this.walls.left)
        }
        this.walls.left.castShadow = false
        this.walls.left.receiveShadow = true
        
        // Right wall
        if (this.walls.right) {
            this.walls.right.geometry.dispose()
            this.walls.right.geometry = new THREE.PlaneGeometry(dimensions.depth, dimensions.height)
            this.walls.right.position.set(dimensions.width / 2, halfHeight, 0)
        } else {
            this.walls.right = new THREE.Mesh(
                new THREE.PlaneGeometry(dimensions.depth, dimensions.height),
                wallMaterial
            )
            this.walls.right.position.set(dimensions.width / 2, halfHeight, 0)
            this.walls.right.rotation.y = -Math.PI / 2
            this.walls.right.name = 'room-right-wall'
            this.roomGroup.add(this.walls.right)
        }
        this.walls.right.castShadow = false
        this.walls.right.receiveShadow = true
    }

    public getCurrentDimensions(): RoomDimensions {
        return { ...this.currentDimensions }
    }

    public dispose(): void {
        RenderLoopRegistry.getInstance().unregister('RoomManager')

        if (this.roomGroup) {
            this.scene.remove(this.roomGroup)
            
            // Dispose tracked room elements directly (no traverse needed)
            this.disposeRoomElement(this.floor)
            this.disposeRoomElement(this.ceiling)
            this.disposeRoomElement(this.walls.front)
            this.disposeRoomElement(this.walls.back)
            this.disposeRoomElement(this.walls.left)
            this.disposeRoomElement(this.walls.right)
            
            this.roomGroup = null
        }
        
        // Reset references
        this.floor = null
        this.ceiling = null
        this.walls = { front: null, back: null, left: null, right: null }
        
        console.debug('🏠 RoomManager disposed')
    }
    
    private disposeRoomElement(mesh: THREE.Mesh | null): void {
        if (!mesh) return
        mesh.geometry?.dispose()
        if (mesh.material instanceof THREE.Material) {
            mesh.material.dispose()
        }
    }
}