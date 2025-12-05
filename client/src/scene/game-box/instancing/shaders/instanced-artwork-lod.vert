// LOD-aware vertex shader for instanced artwork
// Passes texture index and LOD level to fragment shader

attribute float textureIndex;
attribute float lodLevel;  // 0 = high, 1 = mid, 2 = low

varying vec2 vUv;
varying float vTextureIndex;
varying float vLodLevel;

void main() {
    // Fix texture orientation by flipping V coordinate
    vUv = vec2(uv.x, 1.0 - uv.y);
    vTextureIndex = textureIndex;
    vLodLevel = lodLevel;
    
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
