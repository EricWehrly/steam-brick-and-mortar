attribute float textureIndex;
varying vec2 vUv;
varying float vTextureIndex;

void main() {
    // Fix texture orientation by flipping V coordinate
    vUv = vec2(uv.x, 1.0 - uv.y);
    vTextureIndex = textureIndex;
    
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
