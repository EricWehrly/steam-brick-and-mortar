/**
 * Lit artwork material for instanced game artwork boxes.
 *
 * Uses MeshStandardMaterial + onBeforeCompile to inject sampler2DArray
 * texture sampling while preserving Three.js lighting, shadow, tone-mapping,
 * and fog chunks.
 *
 * IMPORTANT: This class depends on specific Three.js shader chunk anchors
 * (for example '#include <map_fragment>'). That is intentionally a thin,
 * tactical extension and can break if upstream chunk names or placement change.
 * Replacements are guarded to fail loudly instead of silently degrading visuals.
 *
 * Attributes injected per-instance (must exist on the geometry):
 *   textureIndex    – slot in the MID texture array
 *   lodLevel        – 0 = HIGH, 1 = MID
 *   highTextureSlot – slot in the HIGH texture array (-1 = not loaded)
 */

import * as THREE from 'three'
import { Setting, type ApplicationSettings } from '../../../core/AppSettings'
import vertDeclarations from './shaders/lit-artwork.vert.declarations.glsl?raw'
import vertImpl from './shaders/lit-artwork.vert.impl.glsl?raw'
import fragDeclarations from './shaders/lit-artwork.frag.declarations.glsl?raw'
import fragMap from './shaders/lit-artwork.frag.map.glsl?raw'
import fragRoughnessVariation from './shaders/lit-artwork.frag.roughness-variation.glsl?raw'

export const LIT_ARTWORK_MATERIAL_SETTING_KEYS = [
    Setting.ArtworkRoughness,
    Setting.ArtworkMetalness,
    Setting.ArtworkFresnelLift,
    Setting.ArtworkFresnelPower,
] as const satisfies ReadonlyArray<keyof ApplicationSettings>

export function isLitArtworkMaterialSettingKey(
    key: keyof ApplicationSettings
): key is (typeof LIT_ARTWORK_MATERIAL_SETTING_KEYS)[number] {
    return LIT_ARTWORK_MATERIAL_SETTING_KEYS.includes(
        key as (typeof LIT_ARTWORK_MATERIAL_SETTING_KEYS)[number]
    )
}

interface LitArtworkUniforms {
    artworkFresnelLift?: { value: number }
    artworkFresnelPower?: { value: number }
}

interface LitArtworkMaterialUserData {
    litArtworkUniforms?: LitArtworkUniforms
    litArtworkFresnelLift?: number
    litArtworkFresnelPower?: number
}

const SHADER_ANCHORS = {
    common: '#include <common>',
    beginVertex: '#include <begin_vertex>',
    mapFragment: '#include <map_fragment>',
    roughnessMapFragment: '#include <roughnessmap_fragment>',
} as const

function replaceRequiredShaderChunk(
    shaderSource: string,
    targetChunk: string,
    replacement: string,
    stage: 'vertex' | 'fragment'
): string {
    if (!shaderSource.includes(targetChunk)) {
        throw new Error(
            `[LitArtworkMaterial] Missing ${stage} shader chunk anchor: ${targetChunk}. `
            + 'Three.js shader chunk layout may have changed.'
        )
    }

    return shaderSource.replace(targetChunk, replacement)
}

/**
 * Compute a deterministic per-instance variation factor (0-1) from textureIndex.
 * Used to break up the synthetic appearance of identical instances with subtle
 * roughness/brightness variations. Uses a simple hash for determinism.
 */
export function computePerInstanceVariation(textureIndex: number): number {
    // Simple hash: fold the texture index through a pseudo-random function
    // Result is normalized to [0, 1] for use as a variation factor
    const x = Math.sin(textureIndex * 12.9898) * 43758.5453
    return x - Math.floor(x)
}

export interface LitArtworkMaterialOptions {
    highTexture: THREE.DataArrayTexture
    midTexture: THREE.DataArrayTexture
}

/** Parameters for fresnel edge lift effect. */
export interface FresnelTuningParams {
    /** Fresnel edge lift intensity (0.0 = none, 1.0 = max). Clipped to [0.0, 0.3]. Default: 0.15 */
    fresnelLift?: number
    /** Fresnel power exponent (higher = sharper edges). Clipped to [2.0, 8.0]. Default: 4.0 */
    fresnelPower?: number
}

/** Gloss and surface tuning parameters. */
export interface GlossTuningParams {
    /** Base roughness value (0.0 = mirror, 1.0 = fully diffuse). Clipped to [0.2, 0.6]. Default: 0.35 */
    roughness?: number
    /** Metalness value for spec response. Clipped to [0.0, 0.2]. Default: 0.05 */
    metalness?: number
}

export type LitArtworkTuningParams = Partial<GlossTuningParams & FresnelTuningParams>

export function createLitArtworkMaterial(options: LitArtworkMaterialOptions): THREE.MeshStandardMaterial {
    const whiteMap = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
        THREE.RGBAFormat
    )
    whiteMap.needsUpdate = true

    const material = new THREE.MeshStandardMaterial({
        side: THREE.FrontSide,
        transparent: true,
        // Roughness/metalness give decent matte look for game artwork cards.
        roughness: 0.4,
        metalness: 0.0,
    })

    // Force Three.js to generate the map UV pipeline, but keep the visible
    // result neutral so the array texture sampling controls the final color.
    material.map = whiteMap

    const userData = material.userData as LitArtworkMaterialUserData
    userData.litArtworkFresnelLift = 0.15
    userData.litArtworkFresnelPower = 4.0

    material.onBeforeCompile = (shader) => {
        // Bind the texture arrays and fresnel parameters as custom uniforms.
        shader.uniforms.textureArrayHigh = { value: options.highTexture }
        shader.uniforms.textureArrayMid  = { value: options.midTexture  }
        shader.uniforms.artworkFresnelLift = { value: userData.litArtworkFresnelLift ?? 0.15 }
        shader.uniforms.artworkFresnelPower = { value: userData.litArtworkFresnelPower ?? 4.0 }

        userData.litArtworkUniforms = {
            artworkFresnelLift: shader.uniforms.artworkFresnelLift as { value: number },
            artworkFresnelPower: shader.uniforms.artworkFresnelPower as { value: number },
        }

        // Vertex: inject varyings + per-instance attribute reads + fresnel computation.
        shader.vertexShader = replaceRequiredShaderChunk(
            shader.vertexShader,
            SHADER_ANCHORS.common,
            SHADER_ANCHORS.common + '\n' + vertDeclarations,
            'vertex'
        )
        shader.vertexShader = replaceRequiredShaderChunk(
            shader.vertexShader,
            SHADER_ANCHORS.beginVertex,
            SHADER_ANCHORS.beginVertex + '\n' + vertImpl,
            'vertex'
        )

        // Fragment: inject uniform/varying declarations.
        shader.fragmentShader = replaceRequiredShaderChunk(
            shader.fragmentShader,
            SHADER_ANCHORS.common,
            SHADER_ANCHORS.common + '\n' + fragDeclarations,
            'fragment'
        )

        // Fragment: replace the standard map_fragment chunk so we sample the
        // texture array instead of a plain map uniform, and apply fresnel.
        shader.fragmentShader = replaceRequiredShaderChunk(
            shader.fragmentShader,
            SHADER_ANCHORS.mapFragment,
            fragMap,
            'fragment'
        )

        // Fragment: inject per-instance roughness variation after roughness map processing.
        // This allows each instance to have subtle variation without popping.
        shader.fragmentShader = replaceRequiredShaderChunk(
            shader.fragmentShader,
            SHADER_ANCHORS.roughnessMapFragment,
            SHADER_ANCHORS.roughnessMapFragment + '\n' + fragRoughnessVariation,
            'fragment'
        )
    }

    // Ensure Three.js re-compiles when the material is cloned or the renderer
    // needs a fresh program (e.g. after shadow-map type changes).
    material.needsUpdate = true

    return material
}

/**
 * Tune gloss parameters on a LitArtworkMaterial.
 *
 * @param material - The MeshStandardMaterial created by createLitArtworkMaterial.
 * @param params - Optional gloss tuning. Unspecified values use defaults.
 */
export function tuneLitArtworkGloss(
    material: THREE.MeshStandardMaterial,
    params?: Partial<GlossTuningParams>
): void {
    material.roughness = Math.min(0.6, Math.max(0.2, params?.roughness ?? 0.4))
    material.metalness = Math.min(0.2, Math.max(0.0, params?.metalness ?? 0.0))
}

/**
 * Tune fresnel edge lift parameters on a LitArtworkMaterial.
 *
 * The fresnel effect lifts color at grazing angles, improving silhouette readability
 * when boxes are viewed obliquely.
 *
 * @param material - The MeshStandardMaterial created by createLitArtworkMaterial.
 * @param params - Optional fresnel tuning. Unspecified values use defaults.
 */
export function tuneLitArtworkFresnel(
    material: THREE.MeshStandardMaterial,
    params?: Partial<FresnelTuningParams>
): void {
    const userData = material.userData as LitArtworkMaterialUserData
    const uniforms = userData.litArtworkUniforms

    const fresnelLift = Math.min(0.3, Math.max(0.0, params?.fresnelLift ?? 0.15))
    const fresnelPower = Math.min(8.0, Math.max(2.0, params?.fresnelPower ?? 4.0))

    userData.litArtworkFresnelLift = fresnelLift
    userData.litArtworkFresnelPower = fresnelPower

    if (uniforms?.artworkFresnelLift) {
        uniforms.artworkFresnelLift.value = fresnelLift
    }
    if (uniforms?.artworkFresnelPower) {
        uniforms.artworkFresnelPower.value = fresnelPower
    }
}

export function applyLitArtworkTuning(
    material: THREE.MeshStandardMaterial,
    params?: LitArtworkTuningParams
): void {
    tuneLitArtworkGloss(material, {
        roughness: params?.roughness,
        metalness: params?.metalness,
    })
    tuneLitArtworkFresnel(material, {
        fresnelLift: params?.fresnelLift,
        fresnelPower: params?.fresnelPower,
    })
    material.needsUpdate = true
}

/**
 * Apply per-instance roughness variation to break up the clone look.
 *
 * Computes a deterministic variation factor from textureIndex and applies
 * a small roughness offset within strict bounds to avoid popping across
 * LOD transitions or camera movement.
 *
 * @param material - The MeshStandardMaterial to modify.
 * @param textureIndex - The texture index for this instance (used to seed deterministic variation).
 * @param baseRoughness - The base roughness value. Variation will be applied around this.
 * @param variationRange - How much to vary roughness (default 0.05 for ±5% of typical range).
 */
export function applyPerInstanceRoughnessVariation(
    material: THREE.MeshStandardMaterial,
    textureIndex: number,
    baseRoughness: number = 0.35,
    variationRange: number = 0.05
): void {
    const variation = computePerInstanceVariation(textureIndex)
    // Map variation [0, 1] to [-variationRange, +variationRange]
    const offset = (variation - 0.5) * 2 * variationRange
    // Clamp final roughness within safe bounds
    material.roughness = Math.min(0.6, Math.max(0.2, baseRoughness + offset))
}
