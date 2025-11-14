/**
 * Shelf Unit Index System - Display shelf unit numbers using sticker/decal system
 * 
 * Uses the sticker system to display numeric indices on shelf units,
 * making it easy to identify which shelf unit is being referenced in logs.
 * 
 * Numbers 0-9 are available in the emoji atlas for rendering.
 */

import type { StickerManager } from './StickerManager'

// Toggle verbose sticker-system debug logging in this module
const STICKERS_DEBUG = false

export class ShelfUnitIndexSystem {
    private stickerManager: StickerManager
    private enabled: boolean = false // Default to disabled (enable via UI toggle)
    
    // Map digit to emoji in atlas (0-9 use number emojis if available)
    private readonly digitEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']
    
    constructor(stickerManager: StickerManager) {
        this.stickerManager = stickerManager
    }
    
    /**
     * Enable index display on shelf units
     */
    public enable(): void {
    this.enabled = true
    if (STICKERS_DEBUG) console.debug('🔍 Shelf unit indices enabled')
    }
    
    /**
     * Disable index display
     * Note: Caller must call refreshAllIndices() after this to update the display
     */
    public disable(): void {
    this.enabled = false
    if (STICKERS_DEBUG) console.debug('🔍 Shelf unit indices disabled')
    }
    
    /**
     * Toggle index display
     */
    public toggle(): void {
        if (this.enabled) {
            this.disable()
        } else {
            this.enable()
        }
    }
    
    /**
     * Add index sticker to a shelf unit's side board
     * @param shelfUnitIndex The shelf unit index (0-based)
     * @param sideboardSurfaceId The surface ID for the sideboard
     */
    public addIndexToSideboard(shelfUnitIndex: number, sideboardSurfaceId: number): void {
        if (!this.enabled) return
        
        // Support up to 3-digit indices (0-999)
        if (shelfUnitIndex > 999) {
            console.warn(`Shelf unit index ${shelfUnitIndex} > 999, skipping label`)
            return
        }
        
        // Convert number to string and get individual digits
        const digits = shelfUnitIndex.toString().split('')
        const digitCount = digits.length
        
        // Calculate spacing between digits (closer together for multi-digit numbers)
        const digitSpacing = 0.15 // UV units between digit centers
        const totalWidth = (digitCount - 1) * digitSpacing
        const startX = 0.5 - totalWidth / 2 // Center the whole number
        
        // Place at top-center of sideboard
        // Note: After Y-flip in shader, lower V values are at the top
        digits.forEach((digit, index) => {
            const digitEmoji = this.digitEmojis[parseInt(digit)]
            const xPos = startX + index * digitSpacing
            
            this.stickerManager.addSticker(
                sideboardSurfaceId,
                digitEmoji,
                [xPos, 0.1],  // Top-center (low V = top after Y-flip)
                0,           // No rotation
                1.5          // Larger scale for visibility
            )
        })
    }
    
    public isEnabled(): boolean {
        return this.enabled
    }
}
