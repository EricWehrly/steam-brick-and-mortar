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

import { paintWoodEnhanced } from './painters/wood-enhanced'
import { paintWoodPlanks } from './painters/wood-planks'
import { paintWoodNormal } from './painters/wood-normal'
import { paintCarpetEnhanced } from './painters/carpet-enhanced'
import { paintCeilingPopcorn, paintCeilingPopcornNormal } from './painters/ceiling-popcorn'
import { paintCeilingEnhanced } from './painters/ceiling-enhanced'

// Worker global scope
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

export {}

// ─── Message Types ────────────────────────────────────────────────────────────

export type ProceduralTextureType =
    | 'wood_enhanced'
    | 'wood_planks'
    | 'wood_normal'
    | 'carpet_enhanced'
    | 'ceiling_popcorn'
    | 'ceiling_popcorn_normal'
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
        case 'wood_planks': {
            const baseColors = (options.baseColors as string[] | undefined) ?? [
                '#7B3F10', '#8B4A14', '#9B5520', '#A8622A', '#8C4A18', '#955218'
            ]
            paintWoodPlanks(data, width, height, {
                numPlanks:      (options.numPlanks      as number)   ?? 4,
                grainFrequency: (options.grainFrequency as number)   ?? 1.2,
                grainStrength:  (options.grainStrength  as number)   ?? 0.12,
                baseColors,
                edgeColor:      (options.edgeColor      as string)   ?? '#5C2F0A',
            })
            break
        }
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
        case 'ceiling_popcorn':
            paintCeilingPopcorn(data, width, height, {
                color:       (options.color       as string) ?? '#E8E6D0',
                bumpDensity: (options.bumpDensity as number) ?? 14,
                bumpHeight:  (options.bumpHeight  as number) ?? 1.4,
                detailScale: (options.detailScale as number) ?? 5,
            })
            break
        case 'ceiling_popcorn_normal':
            paintCeilingPopcornNormal(data, width, height, {
                bumpDensity: (options.bumpDensity as number) ?? 14,
                detailScale: (options.detailScale as number) ?? 5,
                strength:    (options.strength    as number) ?? 20,
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
