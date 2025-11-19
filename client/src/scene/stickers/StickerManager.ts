/**
 * Sticker Manager
 * 
 * Manages sticker placement on shelves with runtime modification support.
 * Handles indexing, placement logic, and sticker state persistence.
 */

import { EmojiTextureAtlas, DEFAULT_SHELF_EMOJIS } from '../../utils/EmojiTextureAtlas'

// Toggle verbose sticker-system debug logging in this module
const STICKERS_DEBUG = false

export interface StickerPlacement {
    shelfId: number          // Which shelf instance
    emoji: string            // Emoji character
    position: [number, number]  // UV position on shelf face (0-1 range for u, v)
    rotation: number         // Rotation in degrees (0-360)
    scale: number            // Scale factor (0.5-2.0 typical range)
    enabled: boolean         // Whether sticker is visible
}

export interface StickerData {
    uvOffset: [number, number]  // Atlas UV offset for emoji
    position: [number, number]  // Surface position (0-1 range)
    rotation: number            // Rotation in degrees
    scale: number               // Scale factor
    enabled: number             // 0 or 1 for shader
}

export class StickerManager {
    private atlas: EmojiTextureAtlas | null = null
    private placements: Map<number, StickerPlacement[]>  // shelfId -> stickers
    private readonly maxStickersPerShelf: number = 10 // Macro texture has no attribute limits!

    constructor() {
        // Atlas creation deferred to initializeAtlas() to avoid blocking startup
        this.placements = new Map()

        if (STICKERS_DEBUG) console.debug('🎨 StickerManager created (atlas deferred)')
    }

    /**
     * Initialize the emoji texture atlas (deferred from constructor to avoid blocking startup)
     * Call this during non-essential systems phase or before first sticker use
     */
    public initializeAtlas(): void {
        if (this.atlas) return // Already initialized

        this.atlas = new EmojiTextureAtlas({
            emojis: [...DEFAULT_SHELF_EMOJIS],
            emojiSize: 128,
            padding: 4,
            atlasSize: 512
        })

        if (STICKERS_DEBUG) console.debug('🎨 EmojiTextureAtlas initialized')
    }

    /**
     * Add a sticker to a shelf with arbitrary position, rotation, and scale
     * @param position UV coordinates [u, v] in 0-1 range
     * @param rotation Rotation in degrees (0-360)
     * @param scale Scale factor (default 1.0)
     */
    public addSticker(
        shelfId: number, 
        emoji: string, 
        position: [number, number] = [0.5, 0.5],
        rotation: number = 0,
        scale: number = 1.0
    ): boolean {
        // Auto-initialize atlas if needed
        const atlas = this.getAtlas()
        
        if (!atlas.hasEmoji(emoji)) {
            console.warn(`Emoji "${emoji}" not in atlas`)
            return false
        }

        const currentStickers = this.placements.get(shelfId) || []
        
        if (currentStickers.length >= this.maxStickersPerShelf) {
            console.warn(`Shelf ${shelfId} already has maximum stickers (${this.maxStickersPerShelf})`)
            return false
        }

        const sticker: StickerPlacement = {
            shelfId,
            emoji,
            position,
            rotation,
            scale,
            enabled: true
        }

        currentStickers.push(sticker)
        this.placements.set(shelfId, currentStickers)

        return true
    }

    /**
     * Remove a sticker from a shelf by index
     */
    public removeStickerByIndex(shelfId: number, index: number): boolean {
        const currentStickers = this.placements.get(shelfId)
        if (!currentStickers || index < 0 || index >= currentStickers.length) {
            return false
        }

        currentStickers.splice(index, 1)
        
        if (currentStickers.length === 0) {
            this.placements.delete(shelfId)
        } else {
            this.placements.set(shelfId, currentStickers)
        }

        return true
    }

    /**
     * Get sticker data for a specific sticker by index (for shader attributes)
     * @param index The sticker index (0-2) on the shelf
     */
    public getStickerDataForShelf(shelfId: number, index: number): StickerData {
        const stickers = this.placements.get(shelfId)
        if (!stickers || index < 0 || index >= stickers.length) {
            return { 
                uvOffset: [0, 0], 
                position: [0.5, 0.5],
                rotation: 0,
                scale: 1.0,
                enabled: 0 
            }
        }

        const sticker = stickers[index]
        if (!sticker?.enabled || !this.atlas) {
            return { 
                uvOffset: [0, 0], 
                position: sticker?.position ?? [0.5, 0.5],
                rotation: sticker?.rotation ?? 0,
                scale: sticker?.scale ?? 1.0,
                enabled: 0 
            }
        }

        const uvOffset = this.atlas.getEmojiUVOffset(sticker.emoji)
        if (!uvOffset) {
            return { 
                uvOffset: [0, 0], 
                position: sticker.position,
                rotation: sticker.rotation,
                scale: sticker.scale,
                enabled: 0 
            }
        }

        return {
            uvOffset,
            position: sticker.position,
            rotation: sticker.rotation,
            scale: sticker.scale,
            enabled: 1
        }
    }

    /**
     * Get all stickers for a shelf
     */
    public getStickersForShelf(shelfId: number): StickerPlacement[] {
        return this.placements.get(shelfId) || []
    }

    /**
     * Toggle sticker visibility by index
     */
    public toggleStickerByIndex(shelfId: number, index: number): boolean {
        const stickers = this.placements.get(shelfId)
        if (!stickers || index < 0 || index >= stickers.length) {
            return false
        }

        stickers[index].enabled = !stickers[index].enabled
        return true
    }

    /**
     * Clear all stickers
     */
    public clearAll(): void {
    this.placements.clear()
    if (STICKERS_DEBUG) console.debug('Cleared all stickers')
    }

    /**
     * Clear stickers for a specific shelf
     */
    public clearShelf(shelfId: number): void {
        this.placements.delete(shelfId)
    }

    /**
     * Get the emoji texture atlas (initializes if needed)
     */
    public getAtlas(): EmojiTextureAtlas {
        if (!this.atlas) {
            this.initializeAtlas()
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.atlas!
    }

    /**
     * Get atlas info for shader configuration
     */
    public getAtlasInfo() {
        if (!this.atlas) {
            this.initializeAtlas()
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.atlas!.getAtlasInfo()
    }

    /**
     * Populate random stickers for testing with arbitrary positioning
     */
    public populateRandomStickers(shelfCount: number, density: number = 0.8): void {
        const emojis = [...DEFAULT_SHELF_EMOJIS]

        for (let shelfId = 0; shelfId < shelfCount; shelfId++) {
            // Random chance to add stickers (80% by default)
            if (Math.random() > density) continue

            // Add 2-5 stickers per shelf (varied for visual interest)
            const stickerCount = Math.floor(Math.random() * 4) + 2 // 2, 3, 4, or 5 stickers

            for (let i = 0; i < stickerCount; i++) {
                const emoji = emojis[Math.floor(Math.random() * emojis.length)]
                
                // Random position (with some margin from edges)
                const position: [number, number] = [
                    0.2 + Math.random() * 0.6,  // u: 0.2 to 0.8
                    0.2 + Math.random() * 0.6   // v: 0.2 to 0.8
                ]
                
                // Random rotation
                const rotation = Math.random() * 360
                
                // Random scale (0.8 to 1.2)
                const scale = 0.8 + Math.random() * 0.4
                
                this.addSticker(shelfId, emoji, position, rotation, scale)
            }
        }

    const totalStickers = Array.from(this.placements.values()).reduce((sum, stickers) => sum + stickers.length, 0)
    if (STICKERS_DEBUG) console.debug(`🎨 Populated ${totalStickers} random stickers across ${this.placements.size} shelves (${shelfCount} total, ${Math.round(density * 100)}% density)`)
    }

    /**
     * Populate random stickers using specific surface IDs (for macro texture with non-sequential IDs)
     */
    public populateRandomStickersWithIds(surfaceIds: number[], density: number = 0.8): void {
        const emojis = [...DEFAULT_SHELF_EMOJIS]

        for (const surfaceId of surfaceIds) {
            // Random chance to add stickers (80% by default)
            if (Math.random() > density) continue

            // Add 2-5 stickers per shelf (varied for visual interest)
            const stickerCount = Math.floor(Math.random() * 4) + 2 // 2, 3, 4, or 5 stickers

            for (let i = 0; i < stickerCount; i++) {
                const emoji = emojis[Math.floor(Math.random() * emojis.length)]
                
                // Random position (with some margin from edges)
                const position: [number, number] = [
                    0.2 + Math.random() * 0.6,  // u: 0.2 to 0.8
                    0.2 + Math.random() * 0.6   // v: 0.2 to 0.8
                ]
                
                // Random rotation
                const rotation = Math.random() * 360
                
                // Random scale (0.8 to 1.2)
                const scale = 0.8 + Math.random() * 0.4
                
                this.addSticker(surfaceId, emoji, position, rotation, scale)
            }
        }

    const totalStickers = Array.from(this.placements.values()).reduce((sum, stickers) => sum + stickers.length, 0)
    if (STICKERS_DEBUG) console.debug(`🎨 Populated ${totalStickers} random stickers across ${this.placements.size} surfaces (${surfaceIds.length} total, ${Math.round(density * 100)}% density)`)
    }

    /**
     * Get the emoji texture atlas for shader rendering
     */
    public getEmojiAtlas(): EmojiTextureAtlas {
        return this.atlas
    }

    public dispose(): void {
        this.atlas.dispose()
        this.placements.clear()
    }
}
