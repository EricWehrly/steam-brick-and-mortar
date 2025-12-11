import * as THREE from 'three'
import { SharedMaterialManager, MaterialType } from '../../utils/SharedMaterialManager'
import { DEFAULT_SHELF_CONFIG, ShelfCalculationUtils, type ShelfConfig } from '../props/SharedPropsUtils'

/**
 * Builds a complete shelf unit as a THREE.Group.
 * 
 * Instead of managing multiple InstancedMesh objects with complex index tracking,
 * we build ONE shelf template and clone it for each shelf position.
 * 
 * Benefits:
 * - Simpler code (no instance index management)
 * - Easier to reason about (one shelf = one Group)
 * - Clone is cheap (geometry/material shared automatically)
 * - Still efficient (Three.js batches objects with same geometry/material)
 */
export class ShelfUnitBuilder {
    private readonly config: Required<ShelfConfig>
    private templateGroup: THREE.Group | null = null
    
    // Cached calculations (computed once since all shelves are identical)
    private readonly shelfYPositions: number[]
    private readonly shelfDepthsAndOffsets: Array<{ shelfDepth: number; forwardOffset: number }>
    
    constructor(config: Partial<ShelfConfig> = {}) {
        this.config = {
            ...DEFAULT_SHELF_CONFIG,
            ...config
        } as Required<ShelfConfig>
        
        // Pre-calculate shelf positions (all shelf units are identical)
        this.shelfYPositions = ShelfCalculationUtils.calculateAllShelfYPositions({
            height: this.config.height,
            shelfCount: this.config.shelfCount,
            shelfVerticalOffset: this.config.shelfVerticalOffset
        })
        
        // Pre-calculate shelf depths
        this.shelfDepthsAndOffsets = []
        for (let i = 0; i < this.config.shelfCount; i++) {
            this.shelfDepthsAndOffsets.push(
                ShelfCalculationUtils.calculateShelfDepthAndOffset(i, {
                    depth: this.config.depth,
                    boardThickness: this.config.boardThickness,
                    shelfCount: this.config.shelfCount,
                    shelfExtensionPerLevel: this.config.shelfExtensionPerLevel
                })
            )
        }
    }
    
    /**
     * Build the shelf template group (call once during initialization)
     */
    public buildTemplate(): THREE.Group {
        if (this.templateGroup) {
            return this.templateGroup
        }
        
        const materialManager = SharedMaterialManager.getInstance()
        const mdfVeneerMaterial = materialManager.getMaterial(MaterialType.MdfVeneer)
        const shelfInteriorMaterial = materialManager.getMaterial(MaterialType.ShelfInterior)
        const brandAccentMaterial = materialManager.getMaterial(MaterialType.BrandAccent)
        
        const group = new THREE.Group()
        group.name = 'shelf-unit-template'
        
        // Build all shelf components at origin (0,0,0)
        // Position is applied when we clone and place the group
        this.addAngledBoards(group, mdfVeneerMaterial)
        this.addSideBoards(group, brandAccentMaterial)
        this.addHorizontalShelves(group, mdfVeneerMaterial, shelfInteriorMaterial)
        
        this.templateGroup = group
        return this.templateGroup
    }
    
    private addAngledBoards(group: THREE.Group, material: THREE.Material): void {
        const { width, height, depth, boardThickness, angle } = this.config
        const angleRad = (angle * Math.PI) / 180
        const boardSeparation = depth * 0.8
        
        const geometry = new THREE.BoxGeometry(width, height, boardThickness)
        
        // Front angled board
        const frontBoard = new THREE.Mesh(geometry, material)
        frontBoard.name = 'angled-board-front'
        frontBoard.position.set(0, height / 2, boardSeparation / 2)
        frontBoard.rotation.x = -angleRad
        group.add(frontBoard)
        
        // Back angled board
        const backBoard = new THREE.Mesh(geometry, material)
        backBoard.name = 'angled-board-back'
        backBoard.position.set(0, height / 2, -boardSeparation / 2)
        backBoard.rotation.x = angleRad
        group.add(backBoard)
    }
    
    private addSideBoards(group: THREE.Group, material: THREE.Material): void {
        const { width, height, depth, boardThickness } = this.config
        
        const geometry = new THREE.BoxGeometry(boardThickness, height, depth)
        
        // Left side board
        const leftBoard = new THREE.Mesh(geometry, material)
        leftBoard.name = 'side-board-left'
        leftBoard.position.set(-width / 2 - boardThickness * 0.5, height / 2, 0)
        group.add(leftBoard)
        
        // Right side board
        const rightBoard = new THREE.Mesh(geometry, material)
        rightBoard.name = 'side-board-right'
        rightBoard.position.set(width / 2 + boardThickness * 0.5, height / 2, 0)
        group.add(rightBoard)
    }
    
    private addHorizontalShelves(group: THREE.Group, shelfMaterial: THREE.Material, interiorMaterial: THREE.Material): void {
        const { width, height, boardThickness, angle, shelfCount } = this.config
        const angleRad = (angle * Math.PI) / 180
        
        for (let i = 0; i < shelfCount; i++) {
            const shelfY = this.shelfYPositions[i]
            const widthAtHeight = width - 2 * (height - shelfY) * Math.tan(angleRad)
            const { shelfDepth, forwardOffset } = this.shelfDepthsAndOffsets[i]
            
            // Shelf board
            const shelfGeometry = new THREE.BoxGeometry(widthAtHeight, boardThickness, shelfDepth)
            const shelfBoard = new THREE.Mesh(shelfGeometry, shelfMaterial)
            shelfBoard.name = `shelf-board-${i}`
            shelfBoard.position.set(0, shelfY, forwardOffset)
            group.add(shelfBoard)
            
            // Interior surface (slightly above shelf board)
            const interiorGeometry = new THREE.BoxGeometry(
                widthAtHeight * 0.98,
                boardThickness * 0.1,
                shelfDepth * 0.98
            )
            const interiorSurface = new THREE.Mesh(interiorGeometry, interiorMaterial)
            interiorSurface.name = `interior-surface-${i}`
            interiorSurface.position.set(0, shelfY + boardThickness * 0.55, forwardOffset)
            group.add(interiorSurface)
        }
    }
    
    /**
     * Create a shelf unit at the specified position
     * Clones the template (geometry/material references are shared, very efficient)
     */
    public createShelfAt(position: THREE.Vector3, name?: string): THREE.Group {
        if (!this.templateGroup) {
            this.buildTemplate()
        }
        
        // Safe to assert - buildTemplate() just set it
        const shelf = this.templateGroup!.clone()  // eslint-disable-line @typescript-eslint/no-non-null-assertion
        shelf.name = name || `shelf-unit-${Date.now()}`
        shelf.position.copy(position)
        
        return shelf
    }
    
    public getConfig(): Readonly<Required<ShelfConfig>> {
        return this.config
    }
    
    public dispose(): void {
        if (this.templateGroup) {
            // Dispose geometries (materials are managed by SharedMaterialManager)
            this.templateGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose()
                }
            })
            this.templateGroup = null
        }
    }
}
