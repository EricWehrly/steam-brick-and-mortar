// Fragment shader for macro texture sticker rendering
// Samples from pre-rendered sticker tiles and blends with base material

uniform sampler2D stickerMacroTexture;
uniform float tilesPerRow;
varying float vShelfId;
varying vec2 vUV;
varying vec3 vWorldNormal;

// Sample sticker from macro texture and blend with base color
// Only apply to surfaces facing roughly X direction (left/right sideboards)
if (abs(vWorldNormal.x) > 0.9) {
    float row = floor(vShelfId / tilesPerRow);
    float col = mod(vShelfId, tilesPerRow);
    vec2 tileOffset = vec2(col, row) / tilesPerRow;
    
    // Fix aspect ratio: sideboard is taller than wide, so scale U to maintain square aspect
    // Assuming sideboard is roughly 2:1 height:width ratio
    vec2 correctedUV = vUV;
    correctedUV.x = correctedUV.x * 0.5 + 0.25; // Center horizontally and scale to 50% width
    
    // Flip V coordinate (canvas Y goes down, UV V goes up)
    correctedUV.y = 1.0 - correctedUV.y;
    
    vec2 tileUV = tileOffset + (correctedUV / tilesPerRow);
    vec4 stickerColor = texture2D(stickerMacroTexture, tileUV);
    
    // Blend stickers on top of base color using alpha
    diffuseColor.rgb = mix(diffuseColor.rgb, stickerColor.rgb, stickerColor.a);
}
