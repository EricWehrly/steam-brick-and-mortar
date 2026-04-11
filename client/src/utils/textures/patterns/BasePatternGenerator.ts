import * as THREE from 'three'

export interface PatternOptions {
  width?: number
  height?: number
  scale?: number
  seed?: number
  colors?: string[]
  backgroundStyle?: 'solid' | 'gradient' | 'noise'
  backgroundColor?: string
  distribution?: number // 0.0 (clustered) to 1.0 (evenly distributed)
  sharpness?: number   // 0.0 (soft/blurred) to 1.0 (sharp/crisp)
  normalMapIntensity?: number // 0.0 (flat) to 1.0 (deep pile/texture)
}

export interface PatternContext {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  random: () => number
}

/**
 * Base class for carpet pattern generators
 * Provides common functionality for canvas-based pattern generation
 */
export abstract class BasePatternGenerator {
  protected seededRandom: () => number

  constructor() {
    this.seededRandom = Math.random
  }

  /**
   * Generate a pattern on the provided canvas context
   */
  abstract generatePattern(context: PatternContext, options: PatternOptions): void

  /**
   * Generate a carpet texture with this pattern
   */
  public createTexture(options: PatternOptions = {}): THREE.Texture {
    const {
      width = 512,
      height = 512,
      seed = Date.now(),
      backgroundColor = '#8B0000'
    } = options

    // Set up seeded random for consistent results
    this.seededRandom = this.createSeededRandom(seed)

    // Create canvas
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context')
    }

    // Create pattern context
    const patternContext: PatternContext = {
      canvas,
      ctx,
      width,
      height,
      random: this.seededRandom
    }

    // Apply background
    this.applyBackground(patternContext, options)

    // Generate the specific pattern
    this.generatePattern(patternContext, options)

    // Create and return THREE.js texture
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    return texture
  }

  /**
   * Apply background styling to the canvas
   */
  protected applyBackground(context: PatternContext, options: PatternOptions): void {
    const { ctx, width, height } = context
    const { backgroundStyle = 'solid', backgroundColor = '#8B0000', colors = [] } = options

    ctx.save()

    switch (backgroundStyle) {
      case 'solid':
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, width, height)
        break

      case 'gradient': {
        const gradient = ctx.createLinearGradient(0, 0, width, height)
        if (colors.length >= 2) {
          gradient.addColorStop(0, colors[0])
          gradient.addColorStop(1, colors[1])
          if (colors.length > 2) {
            const step = 1 / (colors.length - 1)
            colors.forEach((color, index) => {
              gradient.addColorStop(index * step, color)
            })
          }
        } else {
          gradient.addColorStop(0, backgroundColor)
          gradient.addColorStop(1, this.darkenColor(backgroundColor, 0.3))
        }
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
        break
      }

      case 'noise': {
        // Fill with base color first
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, width, height)
        
        // Add noise texture
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data
        const rgb = this.hexToRgb(backgroundColor)
        
        for (let i = 0; i < data.length; i += 4) {
          const noise = (context.random() - 0.5) * 30
          data[i] = Math.max(0, Math.min(255, rgb.r + noise))     // Red
          data[i + 1] = Math.max(0, Math.min(255, rgb.g + noise)) // Green  
          data[i + 2] = Math.max(0, Math.min(255, rgb.b + noise)) // Blue
          data[i + 3] = 255 // Alpha
        }
        
        ctx.putImageData(imageData, 0, 0)
        break
      }
    }

    ctx.restore()
  }

    /**
   * Create a seeded random number generator
   */
  protected createSeededRandom(seed: number): () => number {
    let s = seed
    return () => {
      s = Math.sin(s) * 10000
      return s - Math.floor(s)
    }
  }

  /**
   * Apply sharpness effects to the canvas context
   * @param ctx Canvas context to modify
   * @param sharpness 0.0 (soft/blurred) to 1.0 (sharp/crisp)
   */
  protected applySharpnessEffect(ctx: CanvasRenderingContext2D, sharpness: number): void {
    if (sharpness < 1.0) {
      // Apply blur for values less than 1.0
      const blurAmount = (1.0 - sharpness) * 2 // 0 to 2px blur
      ctx.filter = `blur(${blurAmount}px)`
    } else {
      // Reset filter for maximum sharpness
      ctx.filter = 'none'
    }
  }

  /**
   * Reset canvas context effects
   */
  protected resetCanvasEffects(ctx: CanvasRenderingContext2D): void {
    ctx.filter = 'none'
  }

  /**
   * Utility function to convert hex color to RGB
   */
  protected hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 }
  }

  /**
   * Darken a hex color by a given factor
   */
  protected darkenColor(hex: string, factor: number): string {
    const rgb = this.hexToRgb(hex)
    const darkerRgb = {
      r: Math.round(rgb.r * (1 - factor)),
      g: Math.round(rgb.g * (1 - factor)),
      b: Math.round(rgb.b * (1 - factor))
    }
    return `rgb(${darkerRgb.r}, ${darkerRgb.g}, ${darkerRgb.b})`
  }

  /**
   * Draw a shape with optional glow effect
   */
  protected drawShapeWithGlow(
    ctx: CanvasRenderingContext2D, 
    drawFn: () => void, 
    color: string, 
    glowIntensity: number = 0
  ): void {
    ctx.save()

    if (glowIntensity > 0) {
      // Draw glow effect
      ctx.shadowColor = color
      ctx.shadowBlur = glowIntensity
      ctx.fillStyle = color
      drawFn()
      
      // Reset shadow for main shape
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }

    // Draw main shape
    ctx.fillStyle = color
    drawFn()

    ctx.restore()
  }
}