uniform sampler2DArray textureArray;
varying float vTextureIndex;
varying vec2 vUv;

void main() {
    // Sample from texture array at specific layer
    vec4 texColor = texture(textureArray, vec3(vUv, vTextureIndex));
    
    // Discard fully transparent pixels (optional optimization)
    if (texColor.a < 0.01) discard;
    
    gl_FragColor = texColor;
}
