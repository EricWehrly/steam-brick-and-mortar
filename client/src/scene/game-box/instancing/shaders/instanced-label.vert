attribute float textureIndex;
varying float vTextureIndex;
varying vec2 vUv;

void main() {
    vTextureIndex = textureIndex;
    // UV coordinate permutations (rotation handles front/back orientation):
    // Option 1: vUv = uv;                         (standard)
    // Option 2: vUv = vec2(uv.x, 1.0 - uv.y);     (flip Y)
    // Option 3: vUv = vec2(1.0 - uv.x, uv.y);     (flip X)
    // Option 4: vUv = vec2(1.0 - uv.x, 1.0 - uv.y); (flip both)
    vUv = vec2(uv.x, 1.0 - uv.y);     // (flip Y)
    
    // Use instanced matrix for positioning
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
