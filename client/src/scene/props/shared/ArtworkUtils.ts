import * as THREE from 'three'
import type { GameBoxTextureOptions } from '../../game-box/types/GameBoxOptions'

export class ArtworkUtils {
    static async createTextureOptionsFromBlob(blob: Blob, gameName: string): Promise<GameBoxTextureOptions> {
        return new Promise((resolve, reject) => {
            const img = document.createElement('img') as HTMLImageElement
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas')
                    const ctx = canvas.getContext('2d')
                    
                    if (!ctx) {
                        console.error(`❌ Could not create canvas context for ${gameName}`)
                        reject(new Error('Could not create canvas context'))
                        return
                    }
                    
                    const maxSize = 512
                    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
                    canvas.width = Math.floor(img.width * scale)
                    canvas.height = Math.floor(img.height * scale)
                    
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                    
                    const texture = new THREE.CanvasTexture(canvas)
                    texture.needsUpdate = true
                    
                    resolve({
                        artworkBlobs: { 'header': blob },
                        preferredArtworkType: 'header'
                    })
                    
                    URL.revokeObjectURL(img.src)
                } catch (error) {
                    console.error(`❌ Error processing image for ${gameName}:`, error)
                    reject(error)
                    URL.revokeObjectURL(img.src)
                }
            }
            
            img.onerror = (event) => {
                console.error(`❌ Failed to load image for ${gameName}:`, event)
                reject(new Error(`Failed to load image for ${gameName}`))
                URL.revokeObjectURL(img.src)
            }
            
            img.src = URL.createObjectURL(blob)
        })
    }
}
