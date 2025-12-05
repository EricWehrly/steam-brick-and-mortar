// LOD-aware fragment shader for instanced artwork
// Samples from one of three texture arrays based on lodLevel

uniform sampler2DArray textureArrayHigh;  // Full resolution (512×512)
uniform sampler2DArray textureArrayMid;   // Mid resolution (128×128)
uniform sampler2DArray textureArrayLow;   // Low resolution (16×16)

varying vec2 vUv;
varying float vTextureIndex;
varying float vLodLevel;

void main() {
    vec3 texCoord = vec3(vUv, vTextureIndex);
    vec4 texColor;
    
    // Select texture array based on LOD level
    // Using step functions to avoid branching
    float isHigh = step(0.5, 1.0 - vLodLevel);  // 1 if lodLevel < 0.5
    float isMid = step(0.5, vLodLevel) * step(0.5, 2.0 - vLodLevel);  // 1 if 0.5 <= lodLevel < 1.5
    float isLow = step(1.5, vLodLevel);  // 1 if lodLevel >= 1.5
    
    vec4 highColor = texture(textureArrayHigh, texCoord);
    vec4 midColor = texture(textureArrayMid, texCoord);
    vec4 lowColor = texture(textureArrayLow, texCoord);
    
    texColor = highColor * isHigh + midColor * isMid + lowColor * isLow;
    
    // Handle transparency
    if (texColor.a < 0.1) discard;
    
    gl_FragColor = texColor;
}
