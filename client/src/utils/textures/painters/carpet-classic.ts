import { noise2D, octaveNoise, hexToRgb } from '../noise-utils'

export interface CarpetClassicOptions {
    /** Primary background color (default: '#8B0000') */
    color?: string
    /** Secondary/accent color for geometric pattern (default: '#722F37') */
    accentColor?: string
    /** Fiber noise density (default: 0.4) */
    fiberDensity?: number
    /** PBR roughness value baked into output color variation (default: 0.9) */
    roughness?: number
    /** Geometric overlay opacity 0–1 (default: 0.1) */
    geometricIntensity?: number
    /** Pattern variant (default: 'diamond') */
    variant?: 'diamond' | 'rectangle' | 'subtle'
    /** Pattern tile scale multiplier (default: 1.0) */
    scale?: number
    /** Seeded random seed for repeatable output (default: 12345) */
    seed?: number
}

/** Simple seeded PRNG (sine-based, matches BasePatternGenerator). */
function makeRng(seed: number): () => number {
    let s = seed
    return () => {
        s = Math.sin(s) * 10000
        return s - Math.floor(s)
    }
}

function drawDiamond(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    ctx.beginPath()
    ctx.moveTo(cx,        cy - size)
    ctx.lineTo(cx + size, cy)
    ctx.lineTo(cx,        cy + size)
    ctx.lineTo(cx - size, cy)
    ctx.closePath()
    ctx.fill()
}

/**
 * Replicates ClassicCarpetPatternGenerator logic in worker-safe form.
 *
 * Pipeline:
 *  1. Fill pixel buffer with background color + fiber noise (pure arithmetic, no canvas)
 *  2. Draw geometric overlay onto OffscreenCanvas 2D context
 *  3. Composite overlay onto the pixel buffer by blending at geometricIntensity alpha
 */
export function paintCarpetClassic(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    opts: CarpetClassicOptions = {}
): void {
    const color             = opts.color             ?? '#8B0000'
    const accentColor       = opts.accentColor       ?? '#722F37'
    const fiberDensity      = opts.fiberDensity      ?? 0.4
    const roughness         = opts.roughness         ?? 0.9
    const geometricIntensity = opts.geometricIntensity ?? 0.1
    const variant           = opts.variant           ?? 'diamond'
    const scale             = opts.scale             ?? 1.0
    const seed              = opts.seed              ?? 12345

    const rgb    = hexToRgb(color)
    const accent = hexToRgb(accentColor)
    const rng    = makeRng(seed)

    // ── Pass 1: background fill + fiber noise (pixel arithmetic) ─────────────
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4

            const fiber1 = noise2D(x * fiberDensity * 0.5, y * fiberDensity * 2) * 0.5
            const fiber2 = noise2D(x * fiberDensity * 2,   y * fiberDensity * 0.5) * 0.3
            const fiber3 = noise2D(x * fiberDensity * 4,   y * fiberDensity * 4) * 0.2
            const fv = fiber1 + fiber2 + fiber3

            const cv = octaveNoise(x * 0.01, y * 0.01, 2, 0.6, 1) * 0.15
            const intensity = 1 + (fv + cv) * 0.3 * roughness

            data[i]     = Math.max(0, Math.min(255, rgb.r * intensity))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g * intensity))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b * intensity))
            data[i + 3] = 255
        }
    }

    // ── Pass 2: geometric overlay on OffscreenCanvas ──────────────────────────
    const overlayCanvas = new OffscreenCanvas(width, height)
    const ctx = overlayCanvas.getContext('2d')!
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = `rgb(${accent.r},${accent.g},${accent.b})`

    const patternSize = 40 * scale

    if (variant === 'diamond') {
        const halfSize = patternSize / 2
        for (let y = -patternSize; y < height + patternSize; y += patternSize) {
            for (let x = -patternSize; x < width + patternSize; x += patternSize) {
                const offsetX = (Math.floor(y / patternSize) % 2) * halfSize
                const jitter = (1.0 - 0.5) * 8 + 2  // distribution=0.5 → jitter=6
                const jx = (rng() - 0.5) * jitter
                const jy = (rng() - 0.5) * jitter
                drawDiamond(ctx, x + offsetX + jx, y + jy, halfSize * 0.6)
            }
        }
    } else if (variant === 'rectangle') {
        const rw = patternSize * 0.8
        const rh = patternSize * 0.4
        for (let y = 0; y < height + patternSize; y += patternSize) {
            for (let x = 0; x < width + patternSize; x += patternSize) {
                const jitter = (1.0 - 0.5) * 12 + 3
                const jx = (rng() - 0.5) * jitter
                const jy = (rng() - 0.5) * jitter
                ctx.fillRect(x - rw / 2 + jx, y - rh / 2 + jy, rw, rh)
            }
        }
    } else {
        // subtle: sparse small diamonds and rectangles
        const numShapes = Math.floor((width * height) / (patternSize * patternSize * 8))
        for (let i = 0; i < numShapes; i++) {
            const x  = rng() * width
            const y  = rng() * height
            const sz = (rng() * 0.5 + 0.5) * patternSize * 0.3
            if (rng() < 0.5) {
                drawDiamond(ctx, x, y, sz)
            } else {
                ctx.fillRect(x - sz / 2, y - sz / 4, sz, sz / 2)
            }
        }
    }

    // ── Pass 3: composite overlay into pixel buffer ───────────────────────────
    const overlayData = ctx.getImageData(0, 0, width, height).data
    const alpha = geometricIntensity

    for (let i = 0; i < data.length; i += 4) {
        const oa = overlayData[i + 3] / 255  // overlay pixel alpha (0 where nothing drawn)
        const blendFactor = oa * alpha
        if (blendFactor === 0) continue
        data[i]     = Math.round(data[i]     * (1 - blendFactor) + overlayData[i]     * blendFactor)
        data[i + 1] = Math.round(data[i + 1] * (1 - blendFactor) + overlayData[i + 1] * blendFactor)
        data[i + 2] = Math.round(data[i + 2] * (1 - blendFactor) + overlayData[i + 2] * blendFactor)
    }
}
