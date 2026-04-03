/// <reference lib="webworker" />
/**
 * Procedural Texture Worker
 *
 * Offloads CPU-intensive pixel-painting for procedural environment textures
 * (wood, carpet, ceiling) to a background thread via OffscreenCanvas.
 *
 * Uses the same noise algorithms as the main-thread generators but runs
 * entirely in worker context — no DOM dependencies.
 */

// Worker global scope
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

export {}

// ─── Message Types ────────────────────────────────────────────────────────────

export type ProceduralTextureType =
    | 'wood_enhanced'
    | 'wood_normal'
    | 'carpet_enhanced'
    | 'ceiling_enhanced'

export interface GenerateTextureMessage {
    type: 'GENERATE'
    textureType: ProceduralTextureType
    options: Record<string, unknown>
    messageId: string
}

export interface TextureGeneratedResult {
    type: 'RESULT'
    bitmap: ImageBitmap
    messageId: string
    generationMs: number
}

export interface TextureGenerationError {
    type: 'ERROR'
    error: string
    messageId: string
}

// ─── Noise (ported from NoiseGenerator.ts — no imports needed) ──────────────

const PERM_BASE = [
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,
    142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,
    203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
    74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,
    220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,
    132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,
    186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,
    59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,
    70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,
    178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,
    241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,
    176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,
    128,195,78,66,215,61,156,180
]
const P: number[] = new Array(512)
for (let i = 0; i < 512; i++) P[i] = PERM_BASE[i & 255]

function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(t: number, a: number, b: number): number { return a + t * (b - a) }
function grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15
    const u = h < 8 ? x : y
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

function noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = fade(xf)
    const v = fade(yf)
    const a = P[X] + Y
    const aa = P[a]; const ab = P[a + 1]
    const b = P[X + 1] + Y
    const ba = P[b]; const bb = P[b + 1]
    return lerp(v,
        lerp(u, grad(P[aa], xf, yf, 0), grad(P[ba], xf - 1, yf, 0)),
        lerp(u, grad(P[ab], xf, yf - 1, 0), grad(P[bb], xf - 1, yf - 1, 0))
    )
}

function octaveNoise(x: number, y: number, octaves: number, persistence: number, scale: number): number {
    let total = 0, amplitude = 1, frequency = scale, maxValue = 0
    for (let i = 0; i < octaves; i++) {
        total += noise2D(x * frequency, y * frequency) * amplitude
        maxValue += amplitude
        amplitude *= persistence
        frequency *= 2
    }
    return total / maxValue
}

function woodGrain(offsetX: number, offsetY: number, ringFrequency: number, grainStrength: number): number {
    const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
    const rings = Math.sin(dist * ringFrequency * Math.PI * 2) * 0.5 + 0.5
    const grain = noise2D(offsetX * 0.02, offsetY * 0.02) * grainStrength
    return Math.max(0, Math.min(1, rings + grain))
}

function carpetFiber(x: number, y: number, fiberDensity: number): number {
    const fiber1 = noise2D(x * fiberDensity * 0.5, y * fiberDensity * 2) * 0.5
    const fiber2 = noise2D(x * fiberDensity * 2, y * fiberDensity * 0.5) * 0.3
    const fiber3 = noise2D(x * fiberDensity * 4, y * fiberDensity * 4) * 0.2
    return fiber1 + fiber2 + fiber3
}

// ─── Colour Helpers ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
        ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
        : { r: 128, g: 128, b: 128 }
}

// ─── Pixel Painters ──────────────────────────────────────────────────────────

function paintWoodEnhanced(data: Uint8ClampedArray, width: number, height: number, opts: {
    grainStrength: number; ringFrequency: number
    color1: string; color2: string; color3: string
}): void {
    const { grainStrength, ringFrequency, color1, color2, color3 } = opts
    const rgb1 = hexToRgb(color1)
    const rgb2 = hexToRgb(color2)
    const rgb3 = hexToRgb(color3)
    const centerX = width / 2
    const centerY = height / 2

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const gv = woodGrain(x - centerX, y - centerY, ringFrequency, grainStrength)
            const c1 = octaveNoise(x * 0.03, y * 0.03, 3, 0.5, 1) * 0.12
            const c2 = octaveNoise(x * 0.08, y * 0.08, 4, 0.4, 1) * 0.08
            const c3 = octaveNoise(x * 0.15, y * 0.15, 2, 0.3, 1) * 0.05
            const v = Math.max(0, Math.min(1, gv + c1 + c2 + c3))
            let r: number, g: number, b: number
            if (v < 0.5) {
                const f = v * 2
                r = rgb1.r + (rgb2.r - rgb1.r) * f
                g = rgb1.g + (rgb2.g - rgb1.g) * f
                b = rgb1.b + (rgb2.b - rgb1.b) * f
            } else {
                const f = (v - 0.5) * 2
                r = rgb2.r + (rgb3.r - rgb2.r) * f
                g = rgb2.g + (rgb3.g - rgb2.g) * f
                b = rgb2.b + (rgb3.b - rgb2.b) * f
            }
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
        }
    }
}

function paintWoodNormal(data: Uint8ClampedArray, width: number, height: number, opts: {
    strength: number
}): void {
    const { strength } = opts
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const grainX = Math.sin(x * 0.02) * strength
            const nx = Math.cos(grainX) * 127 + 128
            const ny = Math.sin(grainX) * 127 + 128
            data[i] = Math.floor(nx)
            data[i + 1] = Math.floor(ny)
            data[i + 2] = 255
            data[i + 3] = 255
        }
    }
}

function paintCarpetEnhanced(data: Uint8ClampedArray, width: number, height: number, opts: {
    color: string; fiberDensity: number; roughness: number
}): void {
    const { fiberDensity, roughness } = opts
    const rgb = hexToRgb(opts.color)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const fv = carpetFiber(x, y, fiberDensity)
            const cv = octaveNoise(x * 0.01, y * 0.01, 2, 0.6, 1) * 0.2
            const intensity = 1 + (fv + cv) * roughness
            data[i] = Math.max(0, Math.min(255, rgb.r * intensity))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g * intensity))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b * intensity))
            data[i + 3] = 255
        }
    }
}

function paintCeilingEnhanced(data: Uint8ClampedArray, width: number, height: number, opts: {
    color: string; bumpSize: number; density: number
}): void {
    const { bumpSize, density } = opts
    const rgb = hexToRgb(opts.color)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const bump = octaveNoise(x * density * 0.02, y * density * 0.02, 4, 0.5, 1)
            const detail = octaveNoise(x * density * 0.08, y * density * 0.08, 2, 0.3, 1) * 0.3
            const totalBump = (bump + detail) * bumpSize * 80
            data[i] = Math.max(0, Math.min(255, rgb.r + totalBump))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + totalBump))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + totalBump))
            data[i + 3] = 255
        }
    }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

async function handleGenerate(msg: GenerateTextureMessage): Promise<void> {
    const t0 = performance.now()
    const { textureType, options, messageId } = msg

    // Resolve size
    const width  = (options.width  as number | undefined) ?? 512
    const height = (options.height as number | undefined) ?? 512

    const canvas = new OffscreenCanvas(width, height)
    const octx = canvas.getContext('2d')!
    const imageData = octx.createImageData(width, height)
    const data = imageData.data as Uint8ClampedArray

    switch (textureType) {
        case 'wood_enhanced':
            paintWoodEnhanced(data, width, height, {
                grainStrength: (options.grainStrength as number) ?? 0.4,
                ringFrequency: (options.ringFrequency as number) ?? 0.08,
                color1: (options.color1 as string) ?? '#8B4513',
                color2: (options.color2 as string) ?? '#A0522D',
                color3: (options.color3 as string) ?? '#654321',
            })
            break
        case 'wood_normal':
            paintWoodNormal(data, width, height, {
                strength: (options.strength as number) ?? 0.5,
            })
            break
        case 'carpet_enhanced':
            paintCarpetEnhanced(data, width, height, {
                color:       (options.color       as string) ?? '#8B0000',
                fiberDensity:(options.fiberDensity as number) ?? 0.4,
                roughness:   (options.roughness   as number) ?? 0.8,
            })
            break
        case 'ceiling_enhanced':
            paintCeilingEnhanced(data, width, height, {
                color:    (options.color    as string) ?? '#F5F5DC',
                bumpSize: (options.bumpSize as number) ?? 0.5,
                density:  (options.density  as number) ?? 0.7,
            })
            break
        default:
            ctx.postMessage({
                type: 'ERROR',
                error: `Unknown textureType: ${textureType}`,
                messageId,
            } satisfies TextureGenerationError)
            return
    }

    octx.putImageData(imageData, 0, 0)
    const bitmap = await createImageBitmap(canvas)
    const generationMs = performance.now() - t0

    ctx.postMessage({
        type: 'RESULT',
        bitmap,
        messageId,
        generationMs,
    } satisfies TextureGeneratedResult, [bitmap])
}

ctx.onmessage = (event: MessageEvent<GenerateTextureMessage>) => {
    if (event.data.type === 'GENERATE') {
        handleGenerate(event.data).catch(err => {
            ctx.postMessage({
                type: 'ERROR',
                error: String(err),
                messageId: event.data.messageId,
            } satisfies TextureGenerationError)
        })
    }
}
