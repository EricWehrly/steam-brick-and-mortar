uniform vec3 color;
uniform float opacity;
uniform float gameBottomY;
uniform float beamBottomY;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
    // Radial distance from center
    float radialDist = abs(vUv.x - 0.5) * 2.0;
    float edgeFactor = pow(radialDist, 0.8);
    
    // Fade out below game bottom
    float fadeStart = gameBottomY;
    float fadeEnd = beamBottomY;
    float fadeFactor = 1.0;
    
    if (vWorldPosition.y < fadeStart) {
        float fadeRange = fadeStart - fadeEnd;
        float fadeAmount = (fadeStart - vWorldPosition.y) / fadeRange;
        fadeFactor = 1.0 - clamp(fadeAmount, 0.0, 0.9); // Max 90% fade
    }
    
    float finalOpacity = opacity * edgeFactor * fadeFactor;
    gl_FragColor = vec4(color, finalOpacity);
}
