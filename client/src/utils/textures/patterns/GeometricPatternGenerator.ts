import { BasePatternGenerator } from './BasePatternGenerator'
import type { PatternOptions, PatternContext } from './BasePatternGenerator'

export interface GeometricPatternOptions extends PatternOptions {
  variant?: 'standard' | 'bubble-font' | 'non-euclidean' | 'abstract'
  glowIntensity?: number
  shapeCount?: number
  shapeTypes?: ('circle' | 'triangle' | 'lightning' | 'diamond')[]
  density?: number
}

/**
 * 80s Arcade geometric pattern generator
 * Creates neon shapes on dark backgrounds with various 80s-inspired variants
 */
export class GeometricPatternGenerator extends BasePatternGenerator {

  generatePattern(context: PatternContext, options: PatternOptions): void {
    const geometricOptions = options as GeometricPatternOptions
    const {
      variant = 'standard',
      glowIntensity = 8,
      shapeCount,
      shapeTypes = ['circle', 'triangle', 'lightning', 'diamond'],
      scale = 1.0,
      distribution = 0.5,
      sharpness = 0.7
    } = geometricOptions

    const { ctx } = context

    // Apply sharpness effects
    this.applySharpnessEffect(ctx, sharpness)

    switch (variant) {
      case 'standard':
        this.generateStandardArcade(context, geometricOptions)
        break
      case 'bubble-font':
        this.generateBubbleFont(context, geometricOptions)
        break
      case 'non-euclidean':
        this.generateNonEuclidean(context, geometricOptions)
        break
      case 'abstract':
        this.generateAbstract(context, geometricOptions)
        break
      default:
        // Fallback to standard for unsupported variants
        console.warn(`Unsupported geometric pattern variant: ${variant}, falling back to standard`)
        this.generateStandardArcade(context, geometricOptions)
        break
    }

    // Reset effects  
    this.resetCanvasEffects(ctx)
  }

  /**
   * Standard 80s arcade with geometric shapes
   */
  private generateStandardArcade(context: PatternContext, options: GeometricPatternOptions): void {
    const { ctx, width, height, random } = context
    const {
      colors = ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'], // Neon colors
      glowIntensity = 8,
      shapeTypes = ['circle', 'triangle', 'lightning', 'diamond'],
      scale = 1.0,
      distribution = 0.5
    } = options

    // Calculate shape count based on density if not explicitly provided
    const baseDensity = 4000 // Base divisor for standard density
    const densityMultiplier = (options.density || 0.5) * 2 // Range: 0.0 to 2.0
    const adjustedDensity = baseDensity / Math.max(0.1, densityMultiplier) // Avoid division by zero
    const shapeCount = options.shapeCount || Math.floor((width * height) / adjustedDensity)
    const shapeDistribution = [0.2, 0.3, 0.25, 0.25] // circle, triangle, lightning, diamond

    let shapeIndex = 0
    
    for (let i = 0; i < shapeCount; i++) {
      // Select shape type based on distribution
      const distributionIndex = this.selectFromDistribution(random(), shapeDistribution)
      const shapeType = shapeTypes[distributionIndex]
      
      // Distribution affects positioning: lower values create clustering
      let x, y
      if (distribution < 0.5) {
        // Clustered positioning - create hot spots
        const clusterCenterX = random() * width
        const clusterCenterY = random() * height
        const clusterRadius = (0.5 - distribution) * Math.min(width, height) * 0.3
        
        const angle = random() * Math.PI * 2
        const radius = random() * clusterRadius
        x = clusterCenterX + Math.cos(angle) * radius
        y = clusterCenterY + Math.sin(angle) * radius
        
        // Keep within bounds
        x = Math.max(0, Math.min(width, x))
        y = Math.max(0, Math.min(height, y))
      } else {
        // Even distribution
        x = random() * width
        y = random() * height
      }
      
      const size = (random() * 40 + 20) * scale
      const color = colors[Math.floor(random() * colors.length)]

      this.drawNeonShape(ctx, shapeType, x, y, size, color, glowIntensity)
    }
  }

  /**
   * Bubble-font variant with letter shapes
   */
  private generateBubbleFont(context: PatternContext, options: GeometricPatternOptions): void {
    const { ctx, width, height, random } = context
    const {
      colors = ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
      glowIntensity = 12,
      scale = 1.0
    } = options

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ80sARCADE'.split('')
    // Calculate letter count based on density
    const baseDensity = 8000 // Base divisor for standard density
    const densityMultiplier = (options.density || 0.5) * 2 // Range: 0.0 to 2.0
    const adjustedDensity = baseDensity / Math.max(0.1, densityMultiplier)
    const letterCount = Math.floor((width * height) / adjustedDensity)

    for (let i = 0; i < letterCount; i++) {
      const x = random() * width
      const y = random() * height
      const size = (random() * 60 + 40) * scale
      const letter = letters[Math.floor(random() * letters.length)]
      const colorIndex = Math.floor(random() * colors.length)
      const color = colors[colorIndex] || (colors.length > 0 ? colors[0] : '#00FFFF')

      this.drawBubbleLetter(ctx, letter, x, y, size, color, glowIntensity)
    }
  }

  /**
   * Non-euclidean variant with impossible shapes
   */
  private generateNonEuclidean(context: PatternContext, options: GeometricPatternOptions): void {
    const { ctx, width, height, random } = context
    const {
      colors = ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
      glowIntensity = 10,
      scale = 1.0
    } = options

    const shapeCount = Math.floor((width * height) / 6000)

    for (let i = 0; i < shapeCount; i++) {
      const x = random() * width
      const y = random() * height
      const size = (random() * 50 + 30) * scale
      const color = colors[Math.floor(random() * colors.length)]

      const shapeType = Math.floor(random() * 3)
      switch (shapeType) {
        case 0:
          this.drawImpossibleTriangle(ctx, x, y, size, color, glowIntensity)
          break
        case 1:
          this.drawInfiniteLoop(ctx, x, y, size, color, glowIntensity)
          break
        case 2:
          this.drawParadoxStairs(ctx, x, y, size, color, glowIntensity)
          break
      }
    }
  }

  /**
   * Abstract variant with paint-splash effects
   */
  private generateAbstract(context: PatternContext, options: GeometricPatternOptions): void {
    const { ctx, width, height, random } = context
    const {
      colors = ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'],
      glowIntensity = 15,
      scale = 1.0
    } = options

    const blobCount = Math.floor((width * height) / 5000)

    for (let i = 0; i < blobCount; i++) {
      const x = random() * width
      const y = random() * height
      const size = (random() * 80 + 40) * scale
      const color = colors[Math.floor(random() * colors.length)]

      if (random() < 0.7) {
        this.drawOrganicBlob(ctx, x, y, size, color, glowIntensity)
      } else {
        this.drawFlowingLine(ctx, x, y, size, color, glowIntensity, random)
      }
    }

    // Add geometric accents
    this.addGeometricAccents(context, options)
  }

  /**
   * Draw a neon shape with glow effect
   */
  private drawNeonShape(
    ctx: CanvasRenderingContext2D,
    shapeType: string,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number
  ): void {
    const drawFn = () => {
      switch (shapeType) {
        case 'circle':
          ctx.beginPath()
          ctx.arc(x, y, size / 2, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'triangle':
          ctx.beginPath()
          ctx.moveTo(x, y - size / 2)
          ctx.lineTo(x + size / 2, y + size / 2)
          ctx.lineTo(x - size / 2, y + size / 2)
          ctx.closePath()
          ctx.fill()
          break
        case 'lightning':
          this.drawLightningBolt(ctx, x, y, size)
          break
        case 'diamond':
          this.drawDiamond(ctx, x, y, size / 2)
          break
      }
    }

    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
  }

  /**
   * Draw a bubble letter with 3D effect
   */
  private drawBubbleLetter(
    ctx: CanvasRenderingContext2D,
    letter: string,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number
  ): void {
    ctx.save()
    
    // Create gradient for 3D effect
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size / 2)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, this.darkenColor(color, 0.4))

    const drawFn = () => {
      ctx.font = `bold ${size}px Arial Black`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, x, y)
    }

    // Draw with glow and gradient
    ctx.fillStyle = gradient
    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
    
    ctx.restore()
  }

  /**
   * Draw an impossible triangle (Penrose triangle)
   */
  private drawImpossibleTriangle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number
  ): void {
    const drawFn = () => {
      const third = size / 3
      ctx.lineWidth = 4
      ctx.strokeStyle = color
      
      // Draw three connected parallelograms that shouldn't connect
      ctx.beginPath()
      // Top beam
      ctx.moveTo(x, y - size / 2)
      ctx.lineTo(x + size / 2, y)
      ctx.lineTo(x + third, y + third / 2)
      ctx.lineTo(x - third, y - third / 2)
      ctx.closePath()
      ctx.fill()
      
      // Bottom right beam
      ctx.beginPath()
      ctx.moveTo(x + size / 2, y)
      ctx.lineTo(x, y + size / 2)
      ctx.lineTo(x - third / 2, y + third)
      ctx.lineTo(x + third / 2, y)
      ctx.closePath()
      ctx.fill()
      
      // Bottom left beam
      ctx.beginPath()
      ctx.moveTo(x, y + size / 2)
      ctx.lineTo(x - size / 2, y)
      ctx.lineTo(x - third / 2, y - third)
      ctx.lineTo(x + third / 2, y)
      ctx.closePath()
      ctx.fill()
    }

    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
  }

  /**
   * Draw an infinite loop shape
   */
  private drawInfiniteLoop(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number
  ): void {
    const drawFn = () => {
      const radius = size / 4
      ctx.lineWidth = 8
      ctx.strokeStyle = color
      
      // Draw figure-8 infinity symbol
      ctx.beginPath()
      ctx.arc(x - radius, y, radius, 0, Math.PI * 2)
      ctx.arc(x + radius, y, radius, Math.PI, Math.PI * 3)
      ctx.stroke()
    }

    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
  }

  /**
   * Draw paradox stairs (Penrose stairs fragment)
   */
  private drawParadoxStairs(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number
  ): void {
    const drawFn = () => {
      const step = size / 6
      ctx.lineWidth = 3
      ctx.strokeStyle = color
      
      // Draw impossible stair steps
      for (let i = 0; i < 4; i++) {
        const sx = x - size / 2 + i * step
        const sy = y - size / 2 + i * step
        
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + step, sy)
        ctx.lineTo(sx + step, sy + step)
        ctx.lineTo(sx + step * 2, sy + step)
        ctx.stroke()
      }
    }

    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
  }

  /**
   * Draw organic blob shape
   */
  private drawOrganicBlob(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number
  ): void {
    const drawFn = () => {
      const points = 8
      const angleStep = (Math.PI * 2) / points
      
      ctx.beginPath()
      for (let i = 0; i <= points; i++) {
        const angle = i * angleStep
        const variance = 0.3 + Math.random() * 0.4
        const radius = (size / 2) * variance
        const px = x + Math.cos(angle) * radius
        const py = y + Math.sin(angle) * radius
        
        if (i === 0) {
          ctx.moveTo(px, py)
        } else {
          ctx.lineTo(px, py)
        }
      }
      ctx.closePath()
      ctx.fill()
    }

    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
  }

  /**
   * Draw flowing line connecting random points
   */
  private drawFlowingLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    glowIntensity: number,
    random: () => number
  ): void {
    const drawFn = () => {
      ctx.lineWidth = 6
      ctx.strokeStyle = color
      ctx.lineCap = 'round'
      
      ctx.beginPath()
      ctx.moveTo(x, y)
      
      const segments = 4
      for (let i = 1; i <= segments; i++) {
        const px = x + (random() - 0.5) * size
        const py = y + (random() - 0.5) * size
        ctx.lineTo(px, py)
      }
      
      ctx.stroke()
    }

    this.drawShapeWithGlow(ctx, drawFn, color, glowIntensity)
  }

  /**
   * Add small geometric accents to abstract pattern
   */
  private addGeometricAccents(context: PatternContext, options: GeometricPatternOptions): void {
    const { ctx, width, height, random } = context
    const { colors = ['#00FFFF', '#FF69B4', '#32CD32', '#FFFF00'] } = options

    const accentCount = Math.floor((width * height) / 15000)
    
    for (let i = 0; i < accentCount; i++) {
      const x = random() * width
      const y = random() * height
      const size = random() * 8 + 4
      const color = colors[Math.floor(random() * colors.length)]
      
      if (random() < 0.5) {
        // Small triangle
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(x, y - size)
        ctx.lineTo(x + size, y + size)
        ctx.lineTo(x - size, y + size)
        ctx.closePath()
        ctx.fill()
      } else {
        // Small dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /**
   * Helper methods
   */
  private drawLightningBolt(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const points = [
      [0, -0.5], [0.2, -0.1], [0.1, 0], [0.3, 0.3],
      [0, 0.5], [-0.1, 0.2], [0, 0], [-0.2, -0.2]
    ]
    
    ctx.beginPath()
    points.forEach((point, index) => {
      const px = x + point[0] * size
      const py = y + point[1] * size
      if (index === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    })
    ctx.closePath()
    ctx.fill()
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.beginPath()
    ctx.moveTo(x, y - size)      // Top
    ctx.lineTo(x + size, y)      // Right
    ctx.lineTo(x, y + size)      // Bottom
    ctx.lineTo(x - size, y)      // Left
    ctx.closePath()
    ctx.fill()
  }

  private selectFromDistribution(random: number, distribution: number[]): number {
    let cumulative = 0
    for (let i = 0; i < distribution.length; i++) {
      cumulative += distribution[i]
      if (random <= cumulative) {
        return i
      }
    }
    return distribution.length - 1
  }
}