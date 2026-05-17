/**
 * Lit artwork material for instanced game artwork boxes.
 *
 * Uses MeshStandardMaterial + onBeforeCompile to inject sampler2DArray
 * texture sampling while preserving Three.js lighting, shadow, tone-mapping,
 * and fog chunks.
 *
 * Attributes injected per-instance (must exist on the geometry):
 *   textureIndex    – slot in the MID texture array
 *   lodLevel        – 0 = HIGH, 1 = MID
 *   highTextureSlot – slot in the HIGH texture array (-1 = not loaded)
 */

import * as THREE from 'three'

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

/** GLSL declarations injected into the vertex shader. */
const VERT_DECLARATIONS = /* glsl */ `
attribute float textureIndex;
attribute float lodLevel;
attribute float highTextureSlot;

varying float vTextureIndex;
varying float vLodLevel;
varying float vHighTextureSlot;
varying float vFresnelFactor;

uniform float artworkFresnelPower;
`

/** GLSL injected at the end of the vertex main body. */
const VERT_IMPL = /* glsl */ `
vTextureIndex    = textureIndex;
vLodLevel        = lodLevel;
vHighTextureSlot = highTextureSlot;

// Compute fresnel factor in vertex shader where we have access to normal.
// vViewPosition is available and points from vertex toward camera.
// We compute (1 - |V·N|) and raise to power; at grazing angles this approaches 1.
vec3 viewDir = normalize( vViewPosition );
float NdotV = max( 0.0, dot( normal, viewDir ) );
vFresnelFactor = pow( 1.0 - NdotV, artworkFresnelPower );
`

/** GLSL declarations injected into the fragment shader. */
const FRAG_DECLARATIONS = /* glsl */ `
uniform sampler2DArray textureArrayHigh;
uniform sampler2DArray textureArrayMid;
uniform float artworkFresnelLift;

varying float vTextureIndex;
varying float vLodLevel;
varying float vHighTextureSlot;
varying float vFresnelFactor;
`

/**
 * GLSL that replaces the built-in #include <map_fragment> chunk.
 *
 * We must set diffuseColor (a vec4 used downstream by lighting chunks).
 * We do NOT call gl_FragColor directly — the standard material pipeline
 * writes the final output after tone-mapping, fog, and shadow averaging.
 *
 * UV orientation: DataArrayTextures are bottom-up in WebGL, so we flip V
 * to match the same convention as the legacy ShaderMaterial shaders.
 */
const FRAG_MAP_CHUNK = /* glsl */ `
{
    // GAME_BOX_TEXTURE_BLEND_MARKER: artwork color is sourced from texture arrays here.
    vec2 flippedUv = vec2( vMapUv.x, 1.0 - vMapUv.y );

    bool useHigh = ( vHighTextureSlot >= 0.0 ) && ( vLodLevel < 0.5 );

    vec4 sampledColor;
    if ( useHigh ) {
        sampledColor = texture( textureArrayHigh, vec3( flippedUv, vHighTextureSlot ) );
    } else {
        sampledColor = texture( textureArrayMid, vec3( flippedUv, vTextureIndex ) );
    }

    // Apply fresnel edge lift for silhouette readability.
    // Fresnel factor was computed in vertex shader. At grazing angles, lift the color
    // slightly to help boxes read at oblique camera positions.
    sampledColor.rgb = mix( sampledColor.rgb, sampledColor.rgb * (1.0 + artworkFresnelLift), vFresnelFactor );

    // Honour existing map tint (mapTexelToLinear handles color-space).
    diffuseColor *= sampledColor;
}
`

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

    material.onBeforeCompile = (shader) => {
        // Bind the texture arrays and fresnel parameters as custom uniforms.
        shader.uniforms.textureArrayHigh = { value: options.highTexture }
        shader.uniforms.textureArrayMid  = { value: options.midTexture  }
        shader.uniforms.artworkFresnelLift = { value: 0.15 }
        shader.uniforms.artworkFresnelPower = { value: 4.0 }

        // Vertex: inject varyings + per-instance attribute reads + fresnel computation.
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\n' + VERT_DECLARATIONS
        )
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n' + VERT_IMPL
        )

        // Fragment: inject uniform/varying declarations.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            '#include <common>\n' + FRAG_DECLARATIONS
        )

        // Fragment: replace the standard map_fragment chunk so we sample the
        // texture array instead of a plain map uniform, and apply fresnel.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            FRAG_MAP_CHUNK
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
    if (!material.userData) {
        material.userData = {}
    }

    const shader = (material as any).__webglProgram
    if (shader?.uniforms?.artworkFresnelLift) {
        shader.uniforms.artworkFresnelLift.value = Math.min(0.3, Math.max(0.0, params?.fresnelLift ?? 0.15))
    }
    if (shader?.uniforms?.artworkFresnelPower) {
        shader.uniforms.artworkFresnelPower.value = Math.min(8.0, Math.max(2.0, params?.fresnelPower ?? 4.0))
    }
}
