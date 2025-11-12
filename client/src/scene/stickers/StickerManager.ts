/**
 * Sticker Manager
 * 
 * Manages sticker placement on shelves with runtime modification support.
 * Handles indexing, placement logic, and sticker state persistence.
 */

import { EmojiTextureAtlas, DEFAULT_SHELF_EMOJIS } from '../../utils/EmojiTextureAtlas'

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
    private atlas: EmojiTextureAtlas
    private placements: Map<number, StickerPlacement[]>  // shelfId -> stickers
    private readonly maxStickersPerShelf: number = 3

    constructor() {
        // Initialize emoji atlas with default set
        this.atlas = new EmojiTextureAtlas({
            emojis: [...DEFAULT_SHELF_EMOJIS],
            emojiSize: 128,
            padding: 4,
            atlasSize: 512
        })

        this.placements = new Map()

        console.debug('🎨 StickerManager initialized with emoji atlas')
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
        if (!this.atlas.hasEmoji(emoji)) {
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

        console.debug(`Added sticker ${emoji} to shelf ${shelfId} at [${position[0].toFixed(2)}, ${position[1].toFixed(2)}]`)
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

        console.debug(`Removed sticker ${index} from shelf ${shelfId}`)
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
        if (!sticker?.enabled) {
            return { 
                uvOffset: [0, 0], 
                position: sticker.position,
                rotation: sticker.rotation,
                scale: sticker.scale,
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
        console.debug('Cleared all stickers')
    }

    /**
     * Clear stickers for a specific shelf
     */
    public clearShelf(shelfId: number): void {
        this.placements.delete(shelfId)
    }

    /**
     * Get the emoji texture atlas
     */
    public getAtlas(): EmojiTextureAtlas {
        return this.atlas
    }

    /**
     * Get atlas info for shader configuration
     */
    public getAtlasInfo() {
        return this.atlas.getAtlasInfo()
    }

    /**
     * Populate random stickers for testing with arbitrary positioning
     */
    public populateRandomStickers(shelfCount: number, density: number = 0.3): void {
        console.log(`🎨 [STICKER DEBUG] populateRandomStickers called with shelfCount=${shelfCount}, density=${density}`)
        const emojis = [...DEFAULT_SHELF_EMOJIS]
        console.log(`🎨 [STICKER DEBUG] Available emojis:`, emojis)

        for (let shelfId = 0; shelfId < shelfCount; shelfId++) {
            // Random chance to add stickers
            if (Math.random() > density) continue

            // Add 1-2 stickers per shelf
            const stickerCount = Math.random() > 0.5 ? 1 : 2

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
                
                const added = this.addSticker(shelfId, emoji, position, rotation, scale)
                if (added) {
                    console.log(`🎨 [STICKER DEBUG] Added ${emoji} to shelf ${shelfId} at [${position[0].toFixed(2)}, ${position[1].toFixed(2)}] rotation=${rotation.toFixed(0)}° scale=${scale.toFixed(2)}`)
                }
            }
        }

        const totalStickers = Array.from(this.placements.values()).reduce((sum, stickers) => sum + stickers.length, 0)
        console.log(`🎨 [STICKER DEBUG] FINAL: Populated ${totalStickers} random stickers across ${this.placements.size} shelves (${shelfCount} total surfaces, ${(density * 100).toFixed(0)}% density)`)
        console.log(`🎨 [STICKER DEBUG] Placements map:`, Array.from(this.placements.entries()))
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
