/**
 * Shelf Sticker Texture Atlas - Macro texture layer for all shelf stickers
 * 
 * Creates a single large texture where each shelf gets its own tile.
 * Stickers are rendered directly onto the shelf's tile region.
 * Transparent pixels = no sticker (natural default).
 * 
 * Benefits:
 * - Zero attribute overhead (uses existing UVs)
 * - No WebGL attribute limits
 * - Simple shader (just texture blend)
 * - Supports many stickers per shelf
 * - Easy to update individual shelves
 */

import * as THREE from 'three'
import type { EmojiTextureAtlas } from '../../utils/EmojiTextureAtlas'

export interface ShelfStickerTextureAtlasConfig {
    tileSize?: number       // Pixels per shelf tile (default: 256)
    tilesPerRow?: number    // Tiles in each row/column (default: 16 = 256 shelves max)
    backgroundColor?: string
}

interface StickerPlacement {
    emoji: string
    position: [number, number]  // 0-1 relative to tile
    rotation: number            // degrees
    scale: number               // multiplier
}

export class ShelfStickerTextureAtlas {
    private canvas: HTMLCanvasElement
    private context: CanvasRenderingContext2D
    private texture: THREE.CanvasTexture
    private emojiAtlas: EmojiTextureAtlas
    
    private readonly tileSize: number
    private readonly tilesPerRow: number
    private readonly atlasSize: number
    
    // Track which shelves have stickers for optimization
    private dirtyTiles: Set<number> = new Set()
    private stickerPlacements: Map<number, StickerPlacement[]> = new Map()
    
    constructor(emojiAtlas: EmojiTextureAtlas, config: ShelfStickerTextureAtlasConfig = {}) {
        this.emojiAtlas = emojiAtlas
        this.tileSize = config.tileSize ?? 256
        this.tilesPerRow = config.tilesPerRow ?? 16
        this.atlasSize = this.tileSize * this.tilesPerRow
        
        // Create canvas
        this.canvas = document.createElement('canvas')
        this.canvas.width = this.atlasSize
        this.canvas.height = this.atlasSize
        
        const ctx = this.canvas.getContext('2d', { alpha: true })
        if (!ctx) {
            throw new Error('Failed to get 2D context for sticker texture atlas')
        }
        this.context = ctx
        
        // Clear to transparent
        this.context.clearRect(0, 0, this.atlasSize, this.atlasSize)
        
        // Create Three.js texture
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.minFilter = THREE.LinearFilter
        this.texture.magFilter = THREE.LinearFilter
        this.texture.needsUpdate = true
        
        // Canvas textures in Three.js don't need flipY (unlike image textures)
        // But let's be explicit about it
        this.texture.flipY = false
        
        console.debug(`🎨 Created ShelfStickerTextureAtlas: ${this.atlasSize}x${this.atlasSize} (${this.tilesPerRow}x${this.tilesPerRow} tiles, ${this.tileSize}px each)`)
        console.log(`🎨 [DEBUG] Texture created:`, {
            width: this.canvas.width,
            height: this.canvas.height,
            flipY: this.texture.flipY,
            type: this.texture.constructor.name
        })
    }
    
    /**
     * Add a sticker to a specific shelf's tile
     */
    public addStickerToShelf(
        shelfId: number,
        emoji: string,
        position: [number, number],
        rotation: number = 0,
        scale: number = 1.0
    ): void {
        if (shelfId >= this.tilesPerRow * this.tilesPerRow) {
            console.warn(`ShelfStickerTextureAtlas: shelfId ${shelfId} exceeds capacity (max: ${this.tilesPerRow * this.tilesPerRow})`)
            return
        }
        
        // Store placement for this shelf
        if (!this.stickerPlacements.has(shelfId)) {
            this.stickerPlacements.set(shelfId, [])
        }
        const placements = this.stickerPlacements.get(shelfId)
        if (placements) {
            placements.push({ emoji, position, rotation, scale })
        }
        
        // Mark tile as dirty for next render
        this.dirtyTiles.add(shelfId)
    }
    
    /**
     * Clear all stickers from a shelf's tile
     */
    public clearShelf(shelfId: number): void {
        this.stickerPlacements.delete(shelfId)
        this.dirtyTiles.add(shelfId)
    }
    
    /**
     * Clear all stickers from all shelves
     */
    public clearAll(): void {
        this.stickerPlacements.clear()
        this.context.clearRect(0, 0, this.atlasSize, this.atlasSize)
        this.texture.needsUpdate = true
        this.dirtyTiles.clear()
        console.debug('🎨 Cleared all shelf stickers')
    }
    
    /**
     * Render all dirty tiles to the canvas texture
     */
    public updateTexture(): void {
        if (this.dirtyTiles.size === 0) return
        
        this.dirtyTiles.forEach(shelfId => {
            this.renderShelfTile(shelfId)
        })
        
        this.texture.needsUpdate = true
        this.dirtyTiles.clear()
    }
    
    /**
     * Render a specific shelf's tile with all its stickers
     */
    private renderShelfTile(shelfId: number): void {
        const row = Math.floor(shelfId / this.tilesPerRow)
        const col = shelfId % this.tilesPerRow
        const tileX = col * this.tileSize
        const tileY = row * this.tileSize
        
        // Clear this tile
        this.context.clearRect(tileX, tileY, this.tileSize, this.tileSize)
        
        // Get stickers for this shelf
        const stickers = this.stickerPlacements.get(shelfId)
        if (!stickers || stickers.length === 0) return
        
        console.log(`🎨 [RENDER] Rendering ${stickers.length} stickers for shelf ${shelfId} at tile (${col}, ${row}) = canvas (${tileX}, ${tileY})`)
        
        // Render each sticker
        stickers.forEach((sticker, idx) => {
            this.renderSticker(tileX, tileY, sticker)
            console.log(`🎨 [RENDER]   Sticker ${idx}: ${sticker.emoji} at [${sticker.position[0].toFixed(2)}, ${sticker.position[1].toFixed(2)}]`)
        })
    }
    
    /**
     * Render a single sticker onto the canvas
     */
    private renderSticker(
        tileX: number,
        tileY: number,
        sticker: StickerPlacement
    ): void {
        const { emoji, position, rotation, scale } = sticker
        
        // Calculate position within tile
        const x = tileX + position[0] * this.tileSize
        const y = tileY + position[1] * this.tileSize
        
        // Save context state
        this.context.save()
        
        // Transform context for rotation and scale
        this.context.translate(x, y)
        if (rotation !== 0) {
            this.context.rotate((rotation * Math.PI) / 180)
        }
        if (scale !== 1.0) {
            this.context.scale(scale, scale)
        }
        
        // Render emoji
        const fontSize = this.tileSize * 0.15 // Emoji size relative to tile
        this.context.font = `${fontSize}px Arial`
        this.context.textAlign = 'center'
        this.context.textBaseline = 'middle'
        this.context.fillStyle = 'lime' // Bright green for maximum visibility!
        this.context.fillText(emoji, 0, 0)
        
        // Restore context state
        this.context.restore()
    }
    
    /**
     * Get the Three.js texture for shader use
     */
    public getTexture(): THREE.CanvasTexture {
        return this.texture
    }
    
    /**
     * DEBUG: Export canvas as fullscreen overlay to visually inspect
     */
    public debugExportCanvas(): void {
        const dataUrl = this.canvas.toDataURL()
        console.log('🎨 [DEBUG] Creating fullscreen canvas overlay (click to dismiss)')
        
        // Create fullscreen overlay
        const overlay = document.createElement('div')
        overlay.style.position = 'fixed'
        overlay.style.top = '0'
        overlay.style.left = '0'
        overlay.style.width = '100vw'
        overlay.style.height = '100vh'
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)'
        overlay.style.zIndex = '99999'
        overlay.style.display = 'flex'
        overlay.style.alignItems = 'center'
        overlay.style.justifyContent = 'center'
        overlay.style.cursor = 'pointer'
        
        // Create image
        const img = document.createElement('img')
        img.src = dataUrl
        img.style.maxWidth = '90vw'
        img.style.maxHeight = '90vh'
        img.style.border = '2px solid red'
        img.style.imageRendering = 'pixelated'
        
        // Add label
        const label = document.createElement('div')
        label.textContent = 'Macro Texture Atlas (4096x4096) - Click anywhere to dismiss'
        label.style.position = 'absolute'
        label.style.top = '20px'
        label.style.color = 'white'
        label.style.fontSize = '20px'
        label.style.fontFamily = 'monospace'
        
        overlay.appendChild(img)
        overlay.appendChild(label)
        
        // Click to dismiss
        overlay.addEventListener('click', () => {
            document.body.removeChild(overlay)
            console.log('🎨 [DEBUG] Overlay dismissed')
        })
        
        document.body.appendChild(overlay)
    }
    
    /**
     * Get atlas configuration info
     */
    public getAtlasInfo() {
        return {
            atlasSize: this.atlasSize,
            tileSize: this.tileSize,
            tilesPerRow: this.tilesPerRow,
            maxShelves: this.tilesPerRow * this.tilesPerRow,
            memorySizeMB: ((this.atlasSize * this.atlasSize * 4) / (1024 * 1024)).toFixed(2)
        }
    }
    
    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.texture.dispose()
        this.stickerPlacements.clear()
        this.dirtyTiles.clear()
    }
}
