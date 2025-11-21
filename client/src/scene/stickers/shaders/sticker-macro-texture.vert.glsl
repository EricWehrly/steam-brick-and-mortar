// Vertex shader for macro texture sticker rendering
// Passes shelf ID and UV coordinates to fragment shader for tile-based texture sampling

attribute float shelfId;
varying float vShelfId;
varying vec2 vUV;
varying vec3 vWorldNormal;

vShelfId = shelfId;
vUV = uv;
// Transform normal to world space (not view space like vNormal)
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
