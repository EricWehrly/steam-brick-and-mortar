// LOD-aware vertex shader for instanced artwork
// Two-tier system: HIGH (nearby) + MID (everything else)

attribute float textureIndex;       // Game index in MID array (0 to maxGames-1)
attribute float lodLevel;           // 0 = HIGH, 1 = MID
attribute float highTextureSlot;    // Slot in HIGH array (-1 if not loaded)

varying vec2 vUv;
varying float vTextureIndex;
varying float vLodLevel;
varying float vHighTextureSlot;

void main() {
    // Fix texture orientation by flipping V coordinate
    vUv = vec2(uv.x, 1.0 - uv.y);
    vTextureIndex = textureIndex;
    vLodLevel = lodLevel;
    vHighTextureSlot = highTextureSlot;
    
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
