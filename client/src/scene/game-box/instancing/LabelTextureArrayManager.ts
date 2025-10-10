/**
 * Label Texture Array Manager
 * 
 * Manages texture arrays for GPU-instanced label rendering.
 * Supports two texture sources:
 * 1. Image URLs (from IndexedDB gameImages or other sources)
 * 2. Canvas-based text generation (fallback or for custom labels)
 * 
 * Phase 2 of GPU instancing implementation.
 */

import * as THREE from 'three'

export interface TextureSource {
    /** Game/item identifier */
    id: string | number
    /** Image URL (preferred) or text to render */
    imageUrl?: string
    text?: string
    /** Optional: custom texture size override */
    size?: number
}

export class LabelTextureArrayManager {
    private textureArray: THREE.DataArrayTexture | null = null
    private readonly TEXTURE_SIZE: number
    private loadedImages: Map<string | number, HTMLImageElement> = new Map()
    private canvases: HTMLCanvasElement[] = []

    constructor(textureSize: number = 512) {
        this.TEXTURE_SIZE = textureSize
        console.log(`📦 [LabelTextureArrayManager] Initialized with texture size: ${textureSize}x${textureSize}`)
    }

    /**
     * Build texture array from image URLs (preferred method)
     * Loads images asynchronously and packs them into a DataArrayTexture
     */
    public async buildTextureArrayFromImages(sources: TextureSource[]): Promise<THREE.DataArrayTexture> {
        console.log(`📦 [LabelTextureArrayManager] Building texture array from ${sources.length} images`)
        
        // Load all images in parallel
        const imagePromises = sources.map(source => this.loadImage(source))
        const images = await Promise.all(imagePromises)
        
        // Create texture array data buffer
        const count = sources.length
        const size = this.TEXTURE_SIZE
        const data = new Uint8Array(size * size * count * 4) // RGBA
        
        // Draw each image to canvas and copy to texture array
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = size
        tempCanvas.height = size
        const ctx = tempCanvas.getContext('2d')!
        
        for (let i = 0; i < count; i++) {
            // Clear canvas
            ctx.clearRect(0, 0, size, size)
            
            // Draw image (centered and scaled to fit)
            const img = images[i]
            if (img) {
                this.drawImageCentered(ctx, img, size)
            } else {
                // Fallback: render text if image failed to load
                this.drawTextLabel(ctx, sources[i].text || sources[i].id.toString(), size)
            }
            
            // Copy canvas data to texture array layer
            const imageData = ctx.getImageData(0, 0, size, size)
            const offset = i * size * size * 4
            data.set(imageData.data, offset)
            
            this.canvases.push(tempCanvas.cloneNode(true) as HTMLCanvasElement)
        }
        
        // Create THREE.js DataArrayTexture
        this.textureArray = new THREE.DataArrayTexture(data, size, size, count)
        this.textureArray.format = THREE.RGBAFormat
        this.textureArray.type = THREE.UnsignedByteType
        this.textureArray.needsUpdate = true
        
        console.log(`✅ [LabelTextureArrayManager] Texture array created: ${size}×${size}×${count}`)
        return this.textureArray
    }

    /**
     * Build texture array from text labels (fallback or for custom labels)
     */
    public buildTextureArrayFromText(labels: string[]): THREE.DataArrayTexture {
        console.log(`📦 [LabelTextureArrayManager] Building texture array from ${labels.length} text labels`)
        
        const count = labels.length
        const size = this.TEXTURE_SIZE
        const data = new Uint8Array(size * size * count * 4)
        
        // Create canvas for text rendering
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        
        for (let i = 0; i < count; i++) {
            // Clear and render text
            ctx.clearRect(0, 0, size, size)
            this.drawTextLabel(ctx, labels[i], size)
            
            // Copy to texture array
            const imageData = ctx.getImageData(0, 0, size, size)
            const offset = i * size * size * 4
            data.set(imageData.data, offset)
            
            this.canvases.push(canvas.cloneNode(true) as HTMLCanvasElement)
        }
        
        // Create DataArrayTexture
        this.textureArray = new THREE.DataArrayTexture(data, size, size, count)
        this.textureArray.format = THREE.RGBAFormat
        this.textureArray.type = THREE.UnsignedByteType
        this.textureArray.needsUpdate = true
        
        console.log(`✅ [LabelTextureArrayManager] Text texture array created: ${size}×${size}×${count}`)
        return this.textureArray
    }

    /**
     * Load a single image from URL or create text fallback
     */
    private async loadImage(source: TextureSource): Promise<HTMLImageElement | null> {
        if (!source.imageUrl) {
            console.debug(`⚠️ [LabelTextureArrayManager] No imageUrl for ${source.id}, will use text fallback`)
            return null
        }

        try {
            const img = new Image()
            img.crossOrigin = 'anonymous' // Handle CORS if needed
            
            const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
                img.onload = () => resolve(img)
                img.onerror = () => reject(new Error(`Failed to load image: ${source.imageUrl}`))
            })
            
            img.src = source.imageUrl
            
            const loadedImg = await loadPromise
            this.loadedImages.set(source.id, loadedImg)
            return loadedImg
            
        } catch (error) {
            console.warn(`⚠️ [LabelTextureArrayManager] Failed to load image for ${source.id}:`, error)
            return null
        }
    }

    /**
     * Draw image centered and scaled to fit canvas
     */
    private drawImageCentered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number): void {
        // Calculate scaling to fit image in square while maintaining aspect ratio
        const scale = Math.min(size / img.width, size / img.height)
        const scaledWidth = img.width * scale
        const scaledHeight = img.height * scale
        
        // Center the image
        const x = (size - scaledWidth) / 2
        const y = (size - scaledHeight) / 2
        
        // Draw with background
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight)
    }

    /**
     * Draw text label on canvas
     */
    private drawTextLabel(ctx: CanvasRenderingContext2D, text: string, size: number): void {
        // Background
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, size, size)
        
        // Text
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.floor(size / 10)}px Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        // Word wrap for long text
        const maxWidth = size * 0.9
        const words = text.split(' ')
        const lines: string[] = []
        let currentLine = words[0]
        
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i]
            const metrics = ctx.measureText(testLine)
            
            if (metrics.width > maxWidth) {
                lines.push(currentLine)
                currentLine = words[i]
            } else {
                currentLine = testLine
            }
        }
        lines.push(currentLine)
        
        // Draw lines
        const lineHeight = size / 10
        const totalHeight = lines.length * lineHeight
        const startY = (size - totalHeight) / 2 + lineHeight / 2
        
        lines.forEach((line, i) => {
            ctx.fillText(line, size / 2, startY + i * lineHeight)
        })
    }

    /**
     * Get the created texture array
     */
    public getTextureArray(): THREE.DataArrayTexture | null {
        return this.textureArray
    }

    /**
     * Get stats for debugging
     */
    public getStats(): {
        textureSize: number
        layerCount: number
        loadedImagesCount: number
        memoryEstimate: string
    } {
        const layerCount = this.textureArray?.image.depth || 0
        const bytesPerTexel = 4 // RGBA
        const totalTexels = this.TEXTURE_SIZE * this.TEXTURE_SIZE * layerCount
        const totalBytes = totalTexels * bytesPerTexel
        const megabytes = (totalBytes / (1024 * 1024)).toFixed(2)
        
        return {
            textureSize: this.TEXTURE_SIZE,
            layerCount,
            loadedImagesCount: this.loadedImages.size,
            memoryEstimate: `${megabytes} MB`
        }
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        this.textureArray?.dispose()
        this.textureArray = null
        this.loadedImages.clear()
        this.canvases = []
        
        console.log('🗑️ [LabelTextureArrayManager] Disposed')
    }
}
