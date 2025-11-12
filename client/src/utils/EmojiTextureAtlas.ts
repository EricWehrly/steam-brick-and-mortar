/**
 * Emoji Texture Atlas Generator
 * 
 * Creates a texture atlas from emoji characters for efficient GPU rendering.
 * Emojis are rendered to a canvas and packed into a single texture, with
 * UV coordinates tracked for each emoji.
 */

import * as THREE from 'three'

export interface EmojiAtlasEntry {
    emoji: string
    uvOffset: [number, number]  // UV coordinates in atlas (0-1 range)
    atlasIndex: number           // Index in the atlas for quick lookup
}

export interface EmojiAtlasConfig {
    emojis: string[]
    emojiSize?: number      // Size of each emoji in pixels (default: 128)
    padding?: number        // Padding between emojis (default: 4)
    atlasSize?: number      // Total atlas size (default: 512)
}

export class EmojiTextureAtlas {
    private canvas: HTMLCanvasElement
    private context: CanvasRenderingContext2D
    private texture: THREE.CanvasTexture
    private emojiMap: Map<string, EmojiAtlasEntry>
    private atlasSize: number
    private emojiSize: number
    private padding: number
    private emojisPerRow: number

    constructor(config: EmojiAtlasConfig) {
        const {
            emojis,
            emojiSize = 128,
            padding = 4,
            atlasSize = 512
        } = config

        this.atlasSize = atlasSize
        this.emojiSize = emojiSize
        this.padding = padding
        this.emojisPerRow = Math.floor(atlasSize / (emojiSize + padding))
        this.emojiMap = new Map()

        // Create canvas for rendering
        this.canvas = document.createElement('canvas')
        this.canvas.width = atlasSize
        this.canvas.height = atlasSize
        
        const ctx = this.canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to get 2D context for emoji atlas')
        }
        this.context = ctx

        // Generate the atlas
        this.generateAtlas(emojis)

        // Create Three.js texture
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.needsUpdate = true
        this.texture.minFilter = THREE.LinearFilter
        this.texture.magFilter = THREE.LinearFilter

        console.log(`🎨 [ATLAS DEBUG] Created emoji atlas with ${emojis.length} emojis (${this.emojisPerRow}x${Math.ceil(emojis.length / this.emojisPerRow)})`)
        console.log(`🎨 [ATLAS DEBUG] Atlas size: ${atlasSize}x${atlasSize}, Emoji size: ${this.emojiSize}px, Padding: ${this.padding}px`)
        console.log(`🎨 [ATLAS DEBUG] Texture:`, this.texture)
    }

    private generateAtlas(emojis: string[]): void {
        // Clear canvas with transparent background
        this.context.clearRect(0, 0, this.atlasSize, this.atlasSize)

        // Set up text rendering
        this.context.font = `${this.emojiSize * 0.8}px Arial`
        this.context.textAlign = 'center'
        this.context.textBaseline = 'middle'

        // Render each emoji
        emojis.forEach((emoji, index) => {
            const row = Math.floor(index / this.emojisPerRow)
            const col = index % this.emojisPerRow

            const x = col * (this.emojiSize + this.padding) + this.emojiSize / 2
            const y = row * (this.emojiSize + this.padding) + this.emojiSize / 2

            // Render emoji
            this.context.fillText(emoji, x, y)

            // Calculate UV coordinates (normalized 0-1)
            const uvX = col / this.emojisPerRow
            const uvY = row / Math.ceil(emojis.length / this.emojisPerRow)

            // Store entry
            this.emojiMap.set(emoji, {
                emoji,
                uvOffset: [uvX, uvY],
                atlasIndex: index
            })
        })
    }

    public getTexture(): THREE.CanvasTexture {
        return this.texture
    }

    public getEmojiEntry(emoji: string): EmojiAtlasEntry | undefined {
        return this.emojiMap.get(emoji)
    }

    public getEmojiUVOffset(emoji: string): [number, number] | undefined {
        return this.emojiMap.get(emoji)?.uvOffset
    }

    public hasEmoji(emoji: string): boolean {
        return this.emojiMap.has(emoji)
    }

    public getAtlasInfo() {
        const totalRows = Math.ceil(this.emojiMap.size / this.emojisPerRow)
        return {
            atlasSize: this.atlasSize,
            emojiSize: this.emojiSize,
            emojisPerRow: this.emojisPerRow,
            totalEmojis: this.emojiMap.size,
            uvScale: 1 / this.emojisPerRow, // UV scale per emoji (X axis)
            uvScaleY: 1 / totalRows          // UV scale per emoji (Y axis)
        }
    }

    public dispose(): void {
        this.texture.dispose()
        this.emojiMap.clear()
    }
}

/**
 * Default emoji set for shelf stickers
 */
export const DEFAULT_SHELF_EMOJIS = [
    // Numbers (for shelf unit indices)
    '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣',
    // Decorative stickers
    '🎮', // Gaming
    '🎯', // Target/Achievement
    '⭐', // Star/Favorite
    '🔥', // Hot/Trending
    '💎', // Premium/Rare
    '🏆', // Trophy/Winner
    '❤️', // Love/Like
    '👍', // Thumbs up
    '💯', // Perfect score
    '🎪', // Entertainment
    '🎬', // Movies
    '🎨', // Creative
    '🚀', // Launch/New
    '⚡', // Fast/Action
    '🌟', // Special
    '🎉', // Celebration
] as const
