import { BasePatternGenerator } from './BasePatternGenerator'
import type { PatternOptions, PatternContext } from './BasePatternGenerator'
import { NoiseGenerator } from '../../NoiseGenerator'

export interface ClassicCarpetOptions extends PatternOptions {
  fiberDensity?: number
  geometricIntensity?: number
  patternType?: 'diamond' | 'rectangle' | 'subtle'
}

/**
 * Classic Blockbuster carpet pattern generator
 * Creates the familiar deep red carpet with subtle geometric patterns and fiber texture
 */
export class ClassicCarpetPatternGenerator extends BasePatternGenerator {
  
  generatePattern(context: PatternContext, options: PatternOptions): void {
    const classicOptions = options as ClassicCarpetOptions
    const {
      fiberDensity = 0.4,
      geometricIntensity = 0.1,
      patternType = 'diamond',
      scale = 1.0,
      distribution = 0.5,
      sharpness = 0.7
    } = classicOptions

    const { ctx, width, height, random } = context

    // Apply sharpness effects
    this.applySharpnessEffect(ctx, sharpness)

    // Apply fiber texture using existing noise system
    this.applyFiberTexture(context, fiberDensity)
    
    // Add subtle geometric pattern
    this.addGeometricPattern(context, geometricIntensity, patternType, scale, distribution)

    // Reset effects
    this.resetCanvasEffects(ctx)
  }

  /**
   * Apply carpet fiber texture using the existing NoiseGenerator
   */
  private applyFiberTexture(context: PatternContext, fiberDensity: number): void {
    const { ctx, width, height } = context
    
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4

        // Use existing carpet fiber noise
        const fiberValue = NoiseGenerator.carpetFiber(x, y, fiberDensity)
        
        // Add slight color variation
        const colorVariation = NoiseGenerator.octaveNoise(x * 0.01, y * 0.01, 2, 0.6, 1) * 0.15

        const intensity = 1 + (fiberValue + colorVariation) * 0.3

        // Apply to existing pixel colors
        data[index] = Math.max(0, Math.min(255, data[index] * intensity))     // Red
        data[index + 1] = Math.max(0, Math.min(255, data[index + 1] * intensity)) // Green
        data[index + 2] = Math.max(0, Math.min(255, data[index + 2] * intensity)) // Blue
        // Alpha remains unchanged
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }

  /**
   * Add subtle geometric patterns to the carpet
   */
  private addGeometricPattern(
    context: PatternContext, 
    intensity: number, 
    patternType: string, 
    scale: number,
    distribution: number = 0.5
  ): void {
    const { ctx, width, height, random } = context

    ctx.save()
    ctx.globalAlpha = intensity
    ctx.fillStyle = '#722F37' // Darker maroon for pattern

    const patternSize = 40 * scale

    switch (patternType) {
      case 'diamond':
        this.drawDiamondPattern(ctx, width, height, patternSize, random, distribution)
        break
      case 'rectangle':
        this.drawRectanglePattern(ctx, width, height, patternSize, random, distribution)
        break
      case 'subtle':
        this.drawSubtlePattern(ctx, width, height, patternSize, random, distribution)
        break
      default:
        // Fallback to diamond for unsupported variants
        console.warn(`Unsupported classic carpet variant: ${patternType}, falling back to diamond`)
        this.drawDiamondPattern(ctx, width, height, patternSize, random, distribution)
        break
    }

    ctx.restore()
  }

  /**
   * Draw diamond grid pattern
   */
  private drawDiamondPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    size: number,
    random: () => number,
    distribution: number = 0.5
  ): void {
    const halfSize = size / 2

    for (let y = -size; y < height + size; y += size) {
      for (let x = -size; x < width + size; x += size) {
        // Offset every other row
        const offsetX = (Math.floor(y / size) % 2) * halfSize
        const finalX = x + offsetX

        // Distribution-based randomization
        // Lower distribution = more clustering (higher jitter)
        // Higher distribution = more even spread (lower jitter)
        const jitterAmount = (1.0 - distribution) * 8 + 2 // Range from 10 (clustered) to 2 (even)
        const jitterX = (random() - 0.5) * jitterAmount
        const jitterY = (random() - 0.5) * jitterAmount

        this.drawDiamond(ctx, finalX + jitterX, y + jitterY, halfSize * 0.6)
      }
    }
  }

  /**
   * Draw rectangle grid pattern
   */
  private drawRectanglePattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    size: number,
    random: () => number,
    distribution: number = 0.5
  ): void {
    const rectWidth = size * 0.8
    const rectHeight = size * 0.4

    for (let y = 0; y < height + size; y += size) {
      for (let x = 0; x < width + size; x += size) {
        // Distribution-based randomization
        const jitterAmount = (1.0 - distribution) * 12 + 3 // Range from 15 (clustered) to 3 (even)
        const jitterX = (random() - 0.5) * jitterAmount
        const jitterY = (random() - 0.5) * jitterAmount

        ctx.fillRect(
          x - rectWidth / 2 + jitterX,
          y - rectHeight / 2 + jitterY,
          rectWidth,
          rectHeight
        )
      }
    }
  }

  /**
   * Draw very subtle accent pattern
   */
  private drawSubtlePattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    size: number,
    random: () => number,
    distribution: number = 0.5
  ): void {
    // Distribution affects number of shapes: more clustered = fewer total shapes, more spread = more shapes
    const baseShapeCount = Math.floor((width * height) / (size * size * 8))
    const numShapes = Math.floor(baseShapeCount * (0.7 + distribution * 0.6)) // Range 0.7x to 1.3x

    for (let i = 0; i < numShapes; i++) {
      const x = random() * width
      const y = random() * height
      const shapeSize = (random() * 0.5 + 0.5) * size * 0.3

      if (random() < 0.5) {
        // Small diamond
        this.drawDiamond(ctx, x, y, shapeSize)
      } else {
        // Small rectangle
        ctx.fillRect(x - shapeSize / 2, y - shapeSize / 4, shapeSize, shapeSize / 2)
      }
    }
  }

  /**
   * Draw a diamond shape
   */
  private drawDiamond(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number
  ): void {
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - size)      // Top
    ctx.lineTo(centerX + size, centerY)      // Right
    ctx.lineTo(centerX, centerY + size)      // Bottom
    ctx.lineTo(centerX - size, centerY)      // Left
    ctx.closePath()
    ctx.fill()
  }
}