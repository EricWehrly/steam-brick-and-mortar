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

import { paintWoodEnhanced, type WoodEnhancedOptions } from './painters/wood-enhanced'
import { paintWoodPlanks, type WoodPlanksOptions } from './painters/wood-planks'
import { paintWoodNormal, type WoodNormalOptions } from './painters/wood-normal'
import { paintCarpetClassic, type CarpetClassicOptions } from './painters/carpet-classic'
import { paintCarpetNormal, type CarpetNormalOptions } from './painters/carpet-normal'
import { paintCarpetEnhanced, type CarpetEnhancedOptions } from './painters/carpet-enhanced'
import { paintCeilingPopcorn, paintCeilingPopcornNormal, type CeilingPopcornOptions, type CeilingPopcornNormalOptions } from './painters/ceiling-popcorn'
import { paintCeilingEnhanced, type CeilingEnhancedOptions } from './painters/ceiling-enhanced'
import { paintWallDrywall, paintWallDrywallNormal, type WallDrywallOptions, type WallDrywallNormalOptions } from './painters/wall-drywall'
import { paintWoodPaneling, paintWoodPanelingNormal, type WoodPanelingOptions, type WoodPanelingNormalOptions } from './painters/wood-paneling'
import { paintWallBrick, paintWallBrickNormal, type WallBrickOptions, type WallBrickNormalOptions } from './painters/wall-brick'

// Worker global scope
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

export {}

// ─── Message Types ────────────────────────────────────────────────────────────

export type ProceduralTextureType =
    | 'wood_enhanced'
    | 'wood_planks'
    | 'wood_normal'
    | 'carpet_classic'
    | 'carpet_normal'
    | 'carpet_enhanced'
    | 'ceiling_popcorn'
    | 'ceiling_popcorn_normal'
    | 'ceiling_enhanced'
    | 'wall_drywall'
    | 'wall_drywall_normal'
    | 'wood_paneling'
    | 'wood_paneling_normal'
    | 'wall_brick'
    | 'wall_brick_normal'

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
        case 'wood_planks':
            paintWoodPlanks(data, width, height, options as WoodPlanksOptions)
            break
        case 'wood_enhanced':
            paintWoodEnhanced(data, width, height, options as WoodEnhancedOptions)
            break
        case 'wood_normal':
            paintWoodNormal(data, width, height, options as WoodNormalOptions)
            break
        case 'carpet_classic':
            paintCarpetClassic(data, width, height, options as CarpetClassicOptions)
            break
        case 'carpet_normal':
            paintCarpetNormal(data, width, height, options as CarpetNormalOptions)
            break
        case 'carpet_enhanced':
            paintCarpetEnhanced(data, width, height, options as CarpetEnhancedOptions)
            break
        case 'ceiling_popcorn':
            paintCeilingPopcorn(data, width, height, options as CeilingPopcornOptions)
            break
        case 'ceiling_popcorn_normal':
            paintCeilingPopcornNormal(data, width, height, options as CeilingPopcornNormalOptions)
            break
        case 'ceiling_enhanced':
            paintCeilingEnhanced(data, width, height, options as CeilingEnhancedOptions)
            break
        case 'wall_drywall':
            paintWallDrywall(data, width, height, options as WallDrywallOptions)
            break
        case 'wall_drywall_normal':
            paintWallDrywallNormal(data, width, height, options as WallDrywallNormalOptions)
            break
        case 'wood_paneling':
            paintWoodPaneling(data, width, height, options as WoodPanelingOptions)
            break
        case 'wood_paneling_normal':
            paintWoodPanelingNormal(data, width, height, options as WoodPanelingNormalOptions)
            break
        case 'wall_brick':
            paintWallBrick(data, width, height, options as WallBrickOptions)
            break
        case 'wall_brick_normal':
            paintWallBrickNormal(data, width, height, options as WallBrickNormalOptions)
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
