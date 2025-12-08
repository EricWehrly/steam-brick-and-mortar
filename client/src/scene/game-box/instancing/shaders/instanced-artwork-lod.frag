// LOD-aware fragment shader for instanced artwork
// Two-tier system: HIGH (512×512) for nearby games, MID (128×128) for everything else

uniform sampler2DArray textureArrayHigh;  // Full resolution (512×512) - dynamic, small array
uniform sampler2DArray textureArrayMid;   // Mid resolution (128×128) - covers all games

varying vec2 vUv;
varying float vTextureIndex;
varying float vLodLevel;
varying float vHighTextureSlot;  // Slot in HIGH array (-1 if not loaded)

void main() {
    vec4 texColor;
    
    // HIGH LOD uses dedicated slot (vHighTextureSlot), MID uses game index (vTextureIndex)
    // When vHighTextureSlot >= 0 and lodLevel == 0, use HIGH array
    float useHigh = step(0.0, vHighTextureSlot) * step(0.5, 1.0 - vLodLevel);
    
    vec3 highCoord = vec3(vUv, vHighTextureSlot);
    vec3 midCoord = vec3(vUv, vTextureIndex);
    
    vec4 highColor = texture(textureArrayHigh, highCoord);
    vec4 midColor = texture(textureArrayMid, midCoord);
    
    // Blend: use HIGH when available and at HIGH LOD, otherwise MID
    texColor = highColor * useHigh + midColor * (1.0 - useHigh);
    
    // Handle transparency
    if (texColor.a < 0.1) discard;
    
    gl_FragColor = texColor;
}
