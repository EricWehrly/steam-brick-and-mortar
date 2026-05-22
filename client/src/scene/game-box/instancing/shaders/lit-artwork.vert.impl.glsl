vTextureIndex    = textureIndex;
vLodLevel        = lodLevel;
vHighTextureSlot = highTextureSlot;

// Compute fresnel factor in vertex shader where we have access to normal.
// vViewPosition is available and points from vertex toward camera.
// We compute (1 - |V dot N|) and raise to power; at grazing angles this approaches 1.
vec3 viewDir = normalize( vViewPosition );
float NdotV = max( 0.0, dot( normal, viewDir ) );
vFresnelFactor = pow( 1.0 - NdotV, artworkFresnelPower );

// Compute per-instance roughness variation from textureIndex.
// Uses a simple hash to produce deterministic variation [0, 1] per instance.
float x = sin( textureIndex * 12.9898 ) * 43758.5453;
vRoughnessVariation = x - floor( x );
