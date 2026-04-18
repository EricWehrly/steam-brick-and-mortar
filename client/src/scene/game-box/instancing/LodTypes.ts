import * as THREE from 'three'
import { LOD_LEVEL, LOD_TIER_NAME, type LodLevel } from './IGameArtworkPipeline'

export interface LodTierSpec {
    level: LodLevel
    /** Preferred key for tier identity. */
    tierName?: string
    /** Backward-compatible alias still used by older callers/tests. */
    name?: string
    textureWidth: number
    textureHeight: number
    maxDepth?: number
}

export interface LodRuntimeTierSpec extends Omit<LodTierSpec, 'tierName' | 'name'> {
    tierName: string
    maxDepth: number
}

export interface RendererTextureSourcesEager {
    mode: 'eager'
    mid: THREE.DataArrayTexture
    high: THREE.DataArrayTexture
}

export interface RendererTextureSourcesLazy {
    mode: 'lazy'
    mid: THREE.DataArrayTexture
}

export interface RendererTextureSourcesLegacy {
    mid: THREE.DataArrayTexture
    high?: THREE.DataArrayTexture
}

export type RendererTextureSources = RendererTextureSourcesEager | RendererTextureSourcesLazy | RendererTextureSourcesLegacy

export function buildRuntimeTierSpecs(specs: LodTierSpec[], fallbackDepth: number): LodRuntimeTierSpec[] {
    return specs.map((spec) => ({
        level: spec.level,
        tierName: spec.tierName ?? spec.name ?? (spec.level === LOD_LEVEL.HIGH ? LOD_TIER_NAME.HIGH : LOD_TIER_NAME.MID),
        textureWidth: spec.textureWidth,
        textureHeight: spec.textureHeight,
        maxDepth: spec.maxDepth ?? fallbackDepth,
    }))
}

export function findTierByLevel(specs: LodTierSpec[], level: LodLevel): LodTierSpec | undefined {
    return specs.find(spec => spec.level === level)
}

export function getDefaultLodTierSpecs(): LodTierSpec[] {
    return [
        { level: LOD_LEVEL.HIGH, tierName: LOD_TIER_NAME.HIGH, name: LOD_TIER_NAME.HIGH, textureWidth: 300, textureHeight: 450, maxDepth: 128 },
        { level: LOD_LEVEL.MID, tierName: LOD_TIER_NAME.MID, name: LOD_TIER_NAME.MID, textureWidth: 150, textureHeight: 225 },
    ]
}

