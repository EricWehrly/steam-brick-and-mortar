uniform sampler2DArray textureArray;
varying vec2 vUv;
varying float vTextureIndex;

void main() {
    vec3 texCoord = vec3(vUv, vTextureIndex);
    vec4 texColor = texture(textureArray, texCoord);
    
    // Handle transparency
    if (texColor.a < 0.1) discard;
    
    gl_FragColor = texColor;
}
