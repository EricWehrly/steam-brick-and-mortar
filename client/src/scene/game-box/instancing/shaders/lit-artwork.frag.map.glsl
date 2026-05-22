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
