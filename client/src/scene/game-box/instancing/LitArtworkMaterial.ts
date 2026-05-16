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

/** GLSL declarations injected into the vertex shader. */
const VERT_DECLARATIONS = /* glsl */ `
attribute float textureIndex;
attribute float lodLevel;
attribute float highTextureSlot;

varying float vTextureIndex;
varying float vLodLevel;
varying float vHighTextureSlot;
`

/** GLSL injected at the end of the vertex main body. */
const VERT_IMPL = /* glsl */ `
vTextureIndex    = textureIndex;
vLodLevel        = lodLevel;
vHighTextureSlot = highTextureSlot;
`

/** GLSL declarations injected into the fragment shader. */
const FRAG_DECLARATIONS = /* glsl */ `
uniform sampler2DArray textureArrayHigh;
uniform sampler2DArray textureArrayMid;

varying float vTextureIndex;
varying float vLodLevel;
varying float vHighTextureSlot;
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
        // Bind the texture arrays as custom uniforms.
        shader.uniforms.textureArrayHigh = { value: options.highTexture }
        shader.uniforms.textureArrayMid  = { value: options.midTexture  }

        // Vertex: inject varyings + per-instance attribute reads.
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
        // texture array instead of a plain map uniform.
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
