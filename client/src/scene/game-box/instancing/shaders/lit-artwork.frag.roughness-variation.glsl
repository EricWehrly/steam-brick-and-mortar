{
    // Apply per-instance roughness variation to break clone appearance.
    // Variation [0, 1] is mapped to offset [-0.05, +0.05] around base 0.35.
    // Clamped to [0.2, 0.6] to stay within valid specular response range.
    float roughnessOffset = (vRoughnessVariation - 0.5) * 2.0 * 0.05;
    roughnessFactor = clamp( roughnessFactor + roughnessOffset, 0.2, 0.6 );
}
